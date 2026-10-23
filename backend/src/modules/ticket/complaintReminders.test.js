import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// Complaints redesign (2026-10-23), reminders: not assigned within
// COMPLAINT_ASSIGN_REMINDER_HOURS → the assigners; visit date passed and
// not resolved → the technician and the assigners; one summary a day to the
// assigners. No node-cron on Vercel: these run on activity and from the
// daily cron backstop, each sent once.

let app;
let env;
let Ticket, Notification;
let runComplaintChecks;
let vinay, coordinator, suresh;
let nextNumber = 5000;

const HOUR = 3600000;
const at = (iso) => new Date(iso);

async function complaint(overrides = {}) {
  nextNumber += 1;
  return Ticket.create({
    subject: "Inverter red light",
    source: "complaint_link",
    customerId: null,
    number: nextNumber,
    contactName: "Ramesh Sharma",
    contactPhone: "98100 12345",
    address: "Dwarka",
    status: "open",
    history: [{ type: "comment", byCustomer: true, comment: "Inverter red light" }],
    ...overrides,
  });
}

const reminders = (userId) => Notification.find({ userId, type: "complaint_reminder" }).lean();

beforeAll(async () => {
  await startTestDatabase();
  process.env.CRON_SECRET = "test-cron-secret";
  app = await getTestApp();

  ({ env } = await import("../../config/env.js"));
  ({ default: Ticket } = await import("./ticket.model.js"));
  ({ default: Notification } = await import("../notification/notification.model.js"));
  ({ runComplaintChecks } = await import("./ticketEscalation.service.js"));

  vinay = await createUserDirectly({ name: "Vinay Gupta", email: "vinay@test.local", password: "AdminPass123!", role: "admin" });
  coordinator = await createUserDirectly({
    name: "Office Coordinator",
    email: "coord@test.local",
    password: "Password123",
    role: "employee",
    permissions: { complaints: { view_all: true, assign: true } },
  });
  suresh = await createUserDirectly({ name: "Suresh Kumar", email: "suresh@test.local", password: "Password123", role: "employee" });
});

afterAll(async () => {
  await stopTestDatabase();
});

const defaults = {};
beforeEach(async () => {
  await Ticket.deleteMany({});
  await Notification.deleteMany({});
  await Ticket.db.collection("ticketdigests").deleteMany({}).catch(() => {});
  defaults.assign = env.complaintAssignReminderHours;
});
afterEach(() => {
  env.complaintAssignReminderHours = defaults.assign;
});

describe("not assigned in time", () => {
  it("reminds every assigner once, after COMPLAINT_ASSIGN_REMINDER_HOURS (default 4)", async () => {
    expect(env.complaintAssignReminderHours).toBe(4);
    const raisedAt = at("2026-10-23T05:00:00Z");
    await complaint({ unassignedSince: raisedAt, createdAt: raisedAt });

    await runComplaintChecks(new Date(raisedAt.getTime() + 3.9 * HOUR));
    expect(await reminders(vinay._id)).toHaveLength(0);

    await runComplaintChecks(new Date(raisedAt.getTime() + 4.1 * HOUR));
    await runComplaintChecks(new Date(raisedAt.getTime() + 6 * HOUR));
    const toVinay = await reminders(vinay._id);
    expect(toVinay).toHaveLength(1);
    expect(toVinay[0].message).toMatch(/not been assigned/i);
    expect(await reminders(coordinator._id)).toHaveLength(1);
    expect(await reminders(suresh._id)).toHaveLength(0);
  });

  it("takes the threshold from config", async () => {
    env.complaintAssignReminderHours = 2;
    const raisedAt = at("2026-10-23T05:00:00Z");
    await complaint({ unassignedSince: raisedAt, createdAt: raisedAt });
    await runComplaintChecks(new Date(raisedAt.getTime() + 2.5 * HOUR));
    expect(await reminders(vinay._id)).toHaveLength(1);
  });

  it("counts again from a send-back", async () => {
    const raisedAt = at("2026-10-23T05:00:00Z");
    const ticket = await complaint({ unassignedSince: raisedAt, createdAt: raisedAt });
    await runComplaintChecks(new Date(raisedAt.getTime() + 5 * HOUR));
    expect(await reminders(vinay._id)).toHaveLength(1);

    const sentBackAt = new Date(raisedAt.getTime() + 8 * HOUR);
    await Ticket.updateOne({ _id: ticket._id }, { $set: { unassignedSince: sentBackAt } });
    await runComplaintChecks(new Date(sentBackAt.getTime() + 1 * HOUR));
    expect(await reminders(vinay._id)).toHaveLength(1);
    await runComplaintChecks(new Date(sentBackAt.getTime() + 4.5 * HOUR));
    expect(await reminders(vinay._id)).toHaveLength(2);
  });

  it("does nothing for an assigned complaint", async () => {
    const raisedAt = at("2026-10-23T05:00:00Z");
    await complaint({ unassignedSince: raisedAt, status: "assigned", assignedToId: suresh._id, visitDate: "2026-10-30" });
    await runComplaintChecks(new Date(raisedAt.getTime() + 10 * HOUR));
    expect(await reminders(vinay._id)).toHaveLength(0);
  });
});

describe("visit date passed and not resolved", () => {
  it("reminds the technician and the assigners once, the day after the visit date (India time)", async () => {
    await complaint({ status: "on_the_way", assignedToId: suresh._id, visitDate: "2026-10-25" });

    await runComplaintChecks(at("2026-10-25T23:00:00+05:30"));
    expect(await reminders(suresh._id)).toHaveLength(0);

    await runComplaintChecks(at("2026-10-26T00:30:00+05:30"));
    await runComplaintChecks(at("2026-10-26T09:30:00+05:30"));
    const toSuresh = await reminders(suresh._id);
    expect(toSuresh).toHaveLength(1);
    expect(toSuresh[0].message).toMatch(/visit date .*25 Oct.* passed/i);
    expect(await reminders(vinay._id)).toHaveLength(1);
    expect(await reminders(coordinator._id)).toHaveLength(1);
  });

  it("reminds again when a new visit date also passes; never for a resolved complaint", async () => {
    const ticket = await complaint({ status: "assigned", assignedToId: suresh._id, visitDate: "2026-10-25" });
    await complaint({ status: "resolved", assignedToId: suresh._id, visitDate: "2026-10-20" });

    await runComplaintChecks(at("2026-10-26T10:00:00+05:30"));
    expect(await reminders(suresh._id)).toHaveLength(1);

    await Ticket.updateOne({ _id: ticket._id }, { $set: { visitDate: "2026-10-27" } });
    await runComplaintChecks(at("2026-10-27T10:00:00+05:30"));
    expect(await reminders(suresh._id)).toHaveLength(1);
    await runComplaintChecks(at("2026-10-28T10:00:00+05:30"));
    expect(await reminders(suresh._id)).toHaveLength(2);
  });
});

describe("the daily summary", () => {
  it("goes to every assigner once a day, from 9 AM India time", async () => {
    await complaint({ unassignedSince: at("2026-10-23T05:00:00Z"), createdAt: at("2026-10-23T05:00:00Z") });

    await runComplaintChecks(at("2026-10-24T08:30:00+05:30"));
    expect(await Notification.countDocuments({ type: "complaint_daily_summary" })).toBe(0);

    await runComplaintChecks(at("2026-10-24T09:05:00+05:30"));
    await runComplaintChecks(at("2026-10-24T15:00:00+05:30"));
    const summaries = await Notification.find({ type: "complaint_daily_summary" }).lean();
    expect(summaries.map((n) => String(n.userId)).sort()).toEqual([String(vinay._id), String(coordinator._id)].sort());
    expect(summaries[0].message).toMatch(/1 new yesterday/);
    expect(summaries[0].message).toMatch(/1 not assigned/);
  });
});

describe("the daily cron backstop", () => {
  it("runs the checks with the machine token, and refuses without it", async () => {
    await request(app).get("/api/v1/tickets/escalations/run").expect(401);
    const response = await request(app)
      .get("/api/v1/tickets/escalations/run")
      .set("Authorization", "Bearer test-cron-secret")
      .expect(200);
    expect(response.body.data).toHaveProperty("reminded");
  });
});
