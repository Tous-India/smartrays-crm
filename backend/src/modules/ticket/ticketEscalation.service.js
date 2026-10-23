import { env } from "../../config/env.js";
import { createNotification } from "../notification/notification.service.js";
import Customer from "../customer/customer.model.js";
import Ticket from "./ticket.model.js";
import TicketDigest from "./ticketDigest.model.js";
import { findComplaintAssigners } from "./complaintPeople.js";

/**
 * Complaint reminders and the daily summary (2026-10-23 — replaces the
 * manager → admin escalation of 2026-10-22).
 *
 * THE RULES (complaints from the public form only):
 * - Not assigned COMPLAINT_ASSIGN_REMINDER_HOURS (4) after it arrived, or
 *   after the technician sent it back → every assigner is reminded, once
 *   per time it became unassigned.
 * - Its visit date has passed (India time) plus COMPLAINT_VISIT_GRACE_HOURS
 *   (0) and it is not resolved → the technician and every assigner are
 *   reminded, once per visit date (a new date can be reminded again).
 * - One summary a day (from 9 AM India time) to every assigner.
 * "Assigners" = active admins + anyone holding complaints.assign
 * (complaintPeople.js). Each reminder is recorded on the ticket by a
 * conditional update, so it is sent once however many triggers fire at once.
 *
 * HOW IT RUNS ON VERCEL (no node-cron there — the same two-trigger pattern
 * as the forgotten-check-out reminder, §7.74):
 * 1. On activity — `kickComplaintChecks()`, called (throttled to once per
 *    5 minutes per server instance) when anyone opens a complaint list or
 *    status page, raises a complaint, or the web's notification bell polls.
 * 2. A daily backstop — `GET /api/v1/tickets/escalations/run`, on the same
 *    machine-only credential as the attendance cleanup, scheduled in
 *    vercel.json at 03:30 UTC (09:00 IST). It also sends the daily summary.
 */

const HOUR_MS = 3600000;
const WORKING_STATUSES = ["assigned", "on_the_way", "working"];
const SUMMARY_FROM_HOUR_IST = 9;
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function indiaDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function shortDate(visitDate) {
  const [, month, day] = visitDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/** The moment a visit date counts as passed: the end of that India day, plus the grace. */
function visitPassedAt(visitDate) {
  return new Date(new Date(`${visitDate}T00:00:00+05:30`).getTime() + 24 * HOUR_MS + env.complaintVisitGraceHours * HOUR_MS);
}

async function who(ticket) {
  if (ticket.customerId) {
    const customer = await Customer.findById(ticket.customerId).select("companyName").lean();
    if (customer) return customer.companyName;
  }
  return ticket.contactName || "a customer";
}

/** Records the reminder; true only for the caller that recorded it first. */
async function claim(ticket, kind, key, recipients, now) {
  const claimed = await Ticket.updateOne(
    { _id: ticket._id, reminders: { $not: { $elemMatch: { kind, key } } } },
    { $push: { reminders: { kind, key, notifiedUserIds: recipients, at: now } } }
  );
  return claimed.modifiedCount === 1;
}

async function send(recipients, message, ticket) {
  for (const userId of recipients) {
    await createNotification(userId, "complaint_reminder", message, { module: "complaints", id: ticket._id });
  }
}

/**
 * Sends every reminder that is due and not yet sent. Returns
 * `{ checked, reminded }` (reminded = reminders newly recorded).
 */
export async function runComplaintReminders(now = new Date()) {
  const assignBefore = new Date(now.getTime() - env.complaintAssignReminderHours * HOUR_MS);
  const [unassigned, working] = await Promise.all([
    Ticket.find({ source: "complaint_link", status: "open", unassignedSince: { $lte: assignBefore } }),
    Ticket.find({ source: "complaint_link", status: { $in: WORKING_STATUSES }, visitDate: { $type: "string" } }),
  ]);
  const overdue = working.filter((ticket) => visitPassedAt(ticket.visitDate) <= now);
  if (unassigned.length === 0 && overdue.length === 0) {
    return { checked: 0, reminded: 0 };
  }

  const assignerIds = (await findComplaintAssigners()).map((assigner) => assigner._id);
  let reminded = 0;

  for (const ticket of unassigned) {
    if (!(await claim(ticket, "unassigned", ticket.unassignedSince.toISOString(), assignerIds, now))) continue;
    reminded += 1;
    const hours = Math.floor((now - ticket.unassignedSince) / HOUR_MS);
    await send(assignerIds, `Complaint ${ticket.number} from ${await who(ticket)} has not been assigned for ${hours} hours.`, ticket);
  }

  for (const ticket of overdue) {
    const recipients = [ticket.assignedToId, ...assignerIds.filter((id) => String(id) !== String(ticket.assignedToId))];
    if (!(await claim(ticket, "visit_overdue", ticket.visitDate, recipients, now))) continue;
    reminded += 1;
    await send(
      recipients,
      `Complaint ${ticket.number} from ${await who(ticket)}: the visit date (${shortDate(ticket.visitDate)}) has passed and it is not resolved yet.`,
      ticket
    );
  }

  return { checked: unassigned.length + overdue.length, reminded };
}

/**
 * One summary per India date for every assigner, from 9 AM IST.
 * Returns `{ sent, date }`.
 */
export async function sendDailyComplaintSummary(now = new Date()) {
  const { date, hour } = indiaDateParts(now);
  if (hour < SUMMARY_FROM_HOUR_IST) {
    return { sent: false, date };
  }

  const yesterday = indiaDateParts(new Date(now.getTime() - 24 * HOUR_MS)).date;
  const yesterdayStart = new Date(`${yesterday}T00:00:00+05:30`);
  const todayStart = new Date(`${date}T00:00:00+05:30`);

  const [newYesterday, notAssigned, inProgress, visitOverdue] = await Promise.all([
    Ticket.countDocuments({ source: "complaint_link", createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    Ticket.countDocuments({ source: "complaint_link", status: "open" }),
    Ticket.countDocuments({ source: "complaint_link", status: { $in: WORKING_STATUSES } }),
    Ticket.countDocuments({ source: "complaint_link", status: { $in: WORKING_STATUSES }, visitDate: { $lt: date } }),
  ]);

  try {
    await TicketDigest.create({ date, counts: { newYesterday, open: notAssigned + inProgress, overdue: visitOverdue } });
  } catch (error) {
    if (error?.code === 11000) {
      return { sent: false, date };
    }
    throw error;
  }

  const message =
    newYesterday + notAssigned + inProgress === 0
      ? "No open customer complaints."
      : `Customer complaints: ${newYesterday} new yesterday, ${notAssigned} not assigned, ${inProgress} in progress, ${visitOverdue} past their visit date.`;
  for (const assigner of await findComplaintAssigners()) {
    await createNotification(assigner._id, "complaint_daily_summary", message, { module: "complaint_summary", id: null });
  }

  return { sent: true, date };
}

/** Both checks — what the daily backstop endpoint runs. */
export async function runComplaintChecks(now = new Date()) {
  const reminders = await runComplaintReminders(now);
  const summary = await sendDailyComplaintSummary(now);
  return { ...reminders, summarySent: summary.sent };
}

let lastActivityRunAt = 0;

/**
 * The "on activity" trigger: fire-and-forget, at most once per 5 minutes per
 * server instance, never throws into the request that called it. Off when
 * COMPLAINT_CHECKS_ON_ACTIVITY=false (the test suite sets that, so a test's
 * own requests never send notifications behind its back).
 */
export function kickComplaintChecks(now = new Date()) {
  if (process.env.COMPLAINT_CHECKS_ON_ACTIVITY === "false") return;
  if (now.getTime() - lastActivityRunAt < ACTIVITY_THROTTLE_MS) return;
  lastActivityRunAt = now.getTime();

  runComplaintChecks(now).catch((error) => {
    console.error("[complaints] activity check failed:", error.message);
  });
}
