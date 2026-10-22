import { env } from "../../config/env.js";
import { createNotification } from "../notification/notification.service.js";
import Customer from "../customer/customer.model.js";
import User from "../user/user.model.js";
import Ticket from "./ticket.model.js";
import TicketDigest from "./ticketDigest.model.js";

/**
 * Complaint escalation and the admin's daily summary (2026-10-22).
 *
 * THE RULE (complaints raised through the customer link only):
 * - Not acknowledged (still "Received") COMPLAINT_ACKNOWLEDGE_HOURS (4) after
 *   it was raised → the assignee's manager is told. Still not acknowledged
 *   COMPLAINT_ADMIN_AFTER_HOURS (4) later → the admins are told.
 * - Not resolved COMPLAINT_RESOLVE_HOURS (48) after it was raised → the
 *   manager, then the admins the same number of hours later.
 * - An assignee with no active manager goes straight to the admins at the
 *   first step. An admin is never told about a complaint they hold themselves.
 * - The admins are NOT told about every complaint — only these escalations,
 *   plus one summary a day (from 9 AM India time).
 * Each (kind, level) is recorded on the ticket by a conditional update, so a
 * step is sent once however many triggers fire at the same moment.
 *
 * HOW IT RUNS ON VERCEL (no node-cron there — the same two-trigger pattern
 * as the forgotten-check-out reminder, §7.74):
 * 1. On activity — `kickComplaintChecks()`, called (throttled to once per
 *    5 minutes per server instance) when anyone opens a complaint page or
 *    list, raises a complaint, or the web's notification bell polls. During
 *    working hours that is every few minutes.
 * 2. A daily backstop — `GET /api/v1/tickets/escalations/run`, on the same
 *    machine-only credential as the attendance cleanup, scheduled in
 *    vercel.json at 03:30 UTC (09:00 IST). It also sends the daily summary.
 */

const HOUR_MS = 3600000;
const OPEN_STATUSES = ["open", "in_progress"];
const SUMMARY_FROM_HOUR_IST = 9;
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

function hours(name) {
  return env[name];
}

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

async function activeAdminsExcept(excludedId) {
  const admins = await User.find({ role: "admin", isActive: true }).select("_id");
  return admins.filter((admin) => String(admin._id) !== String(excludedId)).map((admin) => admin._id);
}

/** The steps due for one ticket at `now`: [{ kind, level, overdueHours }]. */
function dueSteps(ticket, hasManager, now) {
  const ageHours = (now - ticket.createdAt) / HOUR_MS;
  const steps = [];

  const consider = (kind, baseHours) => {
    if (ageHours < baseHours) return;
    if (hasManager) {
      steps.push({ kind, level: "manager", overdueHours: baseHours });
      if (ageHours >= baseHours + hours("complaintAdminAfterHours")) {
        steps.push({ kind, level: "admin", overdueHours: baseHours + hours("complaintAdminAfterHours") });
      }
    } else {
      steps.push({ kind, level: "admin", overdueHours: baseHours });
    }
  };

  if (ticket.status === "open") consider("acknowledge", hours("complaintAcknowledgeHours"));
  consider("resolve", hours("complaintResolveHours"));

  return steps;
}

function escalationMessage(ticket, customerName, assigneeName, step) {
  const what =
    step.kind === "acknowledge"
      ? `has not been picked up in ${step.overdueHours} hours`
      : `is not resolved after ${step.overdueHours} hours`;
  return `Complaint ${ticket.number} from ${customerName} ${what}. Assigned to ${assigneeName}.`;
}

/**
 * Sends every escalation step that is due and not yet sent. Returns
 * `{ checked, escalated }` (escalated = steps newly recorded).
 */
export async function runTicketEscalations(now = new Date()) {
  const earliestHours = Math.min(hours("complaintAcknowledgeHours"), hours("complaintResolveHours"));
  const tickets = await Ticket.find({
    source: "complaint_link",
    status: { $in: OPEN_STATUSES },
    assignedToId: { $ne: null },
    createdAt: { $lte: new Date(now.getTime() - earliestHours * HOUR_MS) },
  });

  let escalated = 0;

  for (const ticket of tickets) {
    const assignee = await User.findById(ticket.assignedToId).select("_id name managerId");
    const manager = assignee?.managerId
      ? await User.findOne({ _id: assignee.managerId, isActive: true }).select("_id")
      : null;
    const hasManager = Boolean(manager) && String(manager._id) !== String(ticket.assignedToId);

    const steps = dueSteps(ticket, hasManager, now).filter(
      (step) => !ticket.escalations.some((done) => done.kind === step.kind && done.level === step.level)
    );
    if (steps.length === 0) continue;

    const customer = await Customer.findById(ticket.customerId).select("companyName");

    for (const step of steps) {
      const recipients = step.level === "manager" ? [manager._id] : await activeAdminsExcept(ticket.assignedToId);

      // Record first, conditionally: whoever wins this update sends; anyone
      // racing it finds the step already there and sends nothing.
      const claimed = await Ticket.updateOne(
        { _id: ticket._id, escalations: { $not: { $elemMatch: { kind: step.kind, level: step.level } } } },
        { $push: { escalations: { kind: step.kind, level: step.level, notifiedUserIds: recipients, at: now } } }
      );
      if (claimed.modifiedCount !== 1) continue;

      escalated += 1;
      const message = escalationMessage(ticket, customer?.companyName || "a customer", assignee?.name || "nobody", step);
      for (const userId of recipients) {
        await createNotification(userId, "complaint_escalated", message, { module: "complaints", id: ticket._id });
      }
    }
  }

  return { checked: tickets.length, escalated };
}

/**
 * One summary per India date for every active admin, from 9 AM IST.
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

  const [newYesterday, open, overdue] = await Promise.all([
    Ticket.countDocuments({ source: "complaint_link", createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    Ticket.countDocuments({ source: "complaint_link", status: { $in: OPEN_STATUSES } }),
    Ticket.countDocuments({
      source: "complaint_link",
      $or: [
        { status: "open", createdAt: { $lte: new Date(now.getTime() - hours("complaintAcknowledgeHours") * HOUR_MS) } },
        { status: { $in: OPEN_STATUSES }, createdAt: { $lte: new Date(now.getTime() - hours("complaintResolveHours") * HOUR_MS) } },
      ],
    }),
  ]);

  try {
    await TicketDigest.create({ date, counts: { newYesterday, open, overdue } });
  } catch (error) {
    if (error?.code === 11000) {
      return { sent: false, date };
    }
    throw error;
  }

  const message =
    open === 0 && newYesterday === 0
      ? "No open customer complaints."
      : `Customer complaints: ${newYesterday} new yesterday, ${open} open, ${overdue} overdue.`;
  const admins = await activeAdminsExcept(null);
  for (const adminId of admins) {
    await createNotification(adminId, "complaint_daily_summary", message, { module: "complaint_summary", id: null });
  }

  return { sent: true, date };
}

/** Both checks — what the daily backstop endpoint runs. */
export async function runComplaintChecks(now = new Date()) {
  const escalations = await runTicketEscalations(now);
  const summary = await sendDailyComplaintSummary(now);
  return { ...escalations, summarySent: summary.sent };
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
