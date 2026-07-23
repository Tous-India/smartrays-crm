import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../tests/helpers/testDb.js";
import { createUserDirectly } from "../../tests/helpers/authHelpers.js";

// No test here ever sends a real push (none of these leads have a
// PushSubscription seeded, so sendPush is never even called) — mocked
// anyway for consistency with the rest of the suite's service-mocking
// convention and to keep this file fully self-contained.
vi.mock("../services/webPush.service.js", () => ({
  sendPush: vi.fn(async () => {}),
}));

let Lead, Notification, registerLeadFollowUpReminderCron, runLeadFollowUpReminderJob;
let owner;

beforeAll(async () => {
  await startTestDatabase();

  ({ default: Lead } = await import("../modules/lead/lead.model.js"));
  ({ default: Notification } = await import("../modules/notification/notification.model.js"));
  ({ registerLeadFollowUpReminderCron, runLeadFollowUpReminderJob } = await import(
    "./leadFollowUpReminderCron.js"
  ));

  owner = await createUserDirectly({
    name: "Lead Owner",
    email: "leadowner@test.local",
    password: "Password123",
    role: "sales_associate",
  });
});

afterEach(async () => {
  await Lead.deleteMany({});
  await Notification.deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

function makeLead(overrides = {}) {
  return Lead.create({
    name: "Test Lead",
    ownerId: owner._id,
    status: "new",
    clientType: "residential",
    ...overrides,
  });
}

const REFERENCE_DATE = new Date(2026, 6, 15, 12, 0, 0);

describe("registerLeadFollowUpReminderCron", () => {
  it("schedules the reminder job on a 5-minute tick", async () => {
    const cron = await import("node-cron");
    const scheduleSpy = vi.spyOn(cron.default, "schedule").mockImplementation(() => {});

    registerLeadFollowUpReminderCron();

    expect(scheduleSpy).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));

    scheduleSpy.mockRestore();
  });
});

describe("runLeadFollowUpReminderJob", () => {
  it("sends a 24h reminder for a lead whose follow-up falls within the next 24 hours", async () => {
    const lead = await makeLead({
      followUpDate: new Date(REFERENCE_DATE.getTime() + 12 * 60 * 60 * 1000), // 12h away
    });

    const result = await runLeadFollowUpReminderJob(REFERENCE_DATE);

    expect(result.reminders24h).toBe(1);
    expect((await Lead.findById(lead._id)).followUpReminder24hSentAt).not.toBeNull();

    const notification = await Notification.findOne({ userId: owner._id, type: "lead_follow_up_due" });
    expect(notification).not.toBeNull();
    expect(notification.message).toMatch(/24 hours/);
  });

  it("sends a 15m reminder for a lead whose follow-up falls within the next 15 minutes", async () => {
    const lead = await makeLead({
      followUpDate: new Date(REFERENCE_DATE.getTime() + 10 * 60 * 1000), // 10m away
    });

    const result = await runLeadFollowUpReminderJob(REFERENCE_DATE);

    expect(result.reminders15m).toBe(1);
    expect((await Lead.findById(lead._id)).followUpReminder15mSentAt).not.toBeNull();

    // A lead 10 minutes away is ALSO within the 24h window, so both
    // reminders fire independently (see the "both windows" test below) —
    // find the 15m-specific one by its message text rather than assuming
    // it's the only notification created.
    const notification = await Notification.findOne({
      userId: owner._id,
      type: "lead_follow_up_due",
      message: /15 minutes/,
    });
    expect(notification).not.toBeNull();
  });

  it("a lead due within 15 minutes also still counts toward the 24h window (both are independent guards)", async () => {
    await makeLead({ followUpDate: new Date(REFERENCE_DATE.getTime() + 10 * 60 * 1000) });

    const result = await runLeadFollowUpReminderJob(REFERENCE_DATE);

    expect(result.reminders24h).toBe(1);
    expect(result.reminders15m).toBe(1);
    expect(await Notification.countDocuments({ type: "lead_follow_up_due" })).toBe(2);
  });

  it("does not double-send the same reminder on a second run", async () => {
    await makeLead({ followUpDate: new Date(REFERENCE_DATE.getTime() + 12 * 60 * 60 * 1000) });

    await runLeadFollowUpReminderJob(REFERENCE_DATE);
    const secondResult = await runLeadFollowUpReminderJob(REFERENCE_DATE);

    expect(secondResult.reminders24h).toBe(0);
    expect(await Notification.countDocuments({ type: "lead_follow_up_due" })).toBe(1);
  });

  it("does not remind a lead whose follow-up has already passed", async () => {
    await makeLead({ followUpDate: new Date(REFERENCE_DATE.getTime() - 60 * 60 * 1000) }); // 1h ago

    const result = await runLeadFollowUpReminderJob(REFERENCE_DATE);

    expect(result.reminders24h).toBe(0);
    expect(result.reminders15m).toBe(0);
  });

  it("does not remind a lead whose follow-up is outside both windows", async () => {
    await makeLead({ followUpDate: new Date(REFERENCE_DATE.getTime() + 48 * 60 * 60 * 1000) }); // 48h away

    const result = await runLeadFollowUpReminderJob(REFERENCE_DATE);

    expect(result.reminders24h).toBe(0);
    expect(result.reminders15m).toBe(0);
  });

  it("skips won/lost leads even when their follow-up falls inside a reminder window", async () => {
    await makeLead({
      followUpDate: new Date(REFERENCE_DATE.getTime() + 12 * 60 * 60 * 1000),
      status: "won",
    });
    await makeLead({
      followUpDate: new Date(REFERENCE_DATE.getTime() + 10 * 60 * 1000),
      status: "lost",
      lostReason: "Budget too small",
    });

    const result = await runLeadFollowUpReminderJob(REFERENCE_DATE);

    expect(result.reminders24h).toBe(0);
    expect(result.reminders15m).toBe(0);
  });

  it("never throws — a database error surfaces as a null result instead", async () => {
    const findSpy = vi.spyOn(Lead, "find").mockRejectedValueOnce(new Error("boom"));

    const result = await runLeadFollowUpReminderJob(REFERENCE_DATE);

    expect(result).toBeNull();
    findSpy.mockRestore();
  });
});
