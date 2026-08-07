import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";
import Notification from "../notification/notification.model.js";
import Leave from "./leave.model.js";
import User from "../user/user.model.js";

/**
 * §7.43 (2026-08-06) — leave notification recipients and decisions.
 *
 * The request-side behaviour (manager + all admins, deduplicated, requester
 * skipped) was already correct and is pinned here as a regression guard, not
 * as new behaviour. The genuinely new part is `mark-unapproved-absence`,
 * which previously notified NOBODY despite being the only decision that also
 * applies a double deduction.
 */

let app;
let adminAgent, managerAgent;
let admin, manager, employee, orphanEmployee;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Leave.deleteMany({});
  await Notification.deleteMany({});

  admin = await createUserDirectly({
    name: "Admin",
    email: "admin@lv.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@lv.local", "AdminPass123!");

  manager = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Manager",
      email: "manager@lv.local",
      password: "Password123",
      role: "manager",
    })
  ).body.data;
  managerAgent = await loginAsAgent(app, "manager@lv.local", "Password123");

  employee = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Employee",
      email: "employee@lv.local",
      password: "Password123",
      role: "employee",
      managerId: manager._id,
    })
  ).body.data;

  orphanEmployee = (
    await adminAgent.post("/api/v1/auth/register").send({
      name: "Orphan",
      email: "orphan@lv.local",
      password: "Password123",
      role: "employee",
    })
  ).body.data;

  await Notification.deleteMany({});
});

async function requestLeaveAs(email) {
  const agent = await loginAsAgent(app, email, "Password123");

  return agent.post("/api/v1/leave/request").send({
    startDate: "2027-04-01",
    endDate: "2027-04-02",
    type: "unpaid",
    reason: "test",
  });
}

const recipientsOf = async (type) =>
  (await Notification.find({ type }).lean()).map((n) => String(n.userId)).sort();

describe("Leave request — recipients (regression guard, already correct)", () => {
  it("notifies BOTH the employee's manager and every admin", async () => {
    await requestLeaveAs("employee@lv.local");

    expect(await recipientsOf("leave_requested")).toEqual(
      [String(manager._id), String(admin._id)].sort()
    );
  });

  it("still notifies admins when the employee has NO managerId", async () => {
    await requestLeaveAs("orphan@lv.local");

    expect(await recipientsOf("leave_requested")).toEqual([String(admin._id)]);
  });

  it("produces exactly ONE notification when the manager IS an admin", async () => {
    // The live situation: the real team is headed by the admin account.
    await User.updateOne({ _id: employee._id }, { $set: { managerId: admin._id } });

    await requestLeaveAs("employee@lv.local");

    const rows = await Notification.find({ type: "leave_requested" }).lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].userId)).toBe(String(admin._id));
  });

  it("never notifies the SUBJECT of the request, only the approvers", async () => {
    // Admins cannot self-request (403 by design), so the reachable form of
    // the self-skip is an admin requesting ON BEHALF OF an employee: the
    // employee is the subject and must not be told about their own request.
    await adminAgent.post("/api/v1/leave/request").send({
      employeeId: employee._id,
      startDate: "2027-05-01",
      endDate: "2027-05-02",
      type: "unpaid",
      reason: "on behalf of",
    });

    const recipients = await recipientsOf("leave_requested");
    expect(recipients).not.toContain(String(employee._id));
    expect(recipients).toEqual([String(manager._id), String(admin._id)].sort());
  });

  it("deep-links to /attendance, where Leave now lives", async () => {
    await requestLeaveAs("employee@lv.local");

    const [row] = await Notification.find({ type: "leave_requested" }).lean();
    // The standalone /leave route was removed; the frontend maps
    // relatedEntity.module === "leave" to /attendance.
    expect(row.relatedEntity.module).toBe("leave");
  });
});

describe("Leave decisions — the employee is told which one", () => {
  async function pendingLeaveId(email = "employee@lv.local") {
    const response = await requestLeaveAs(email);
    await Notification.deleteMany({});

    return response.body.data._id;
  }

  it("notifies the employee on APPROVE", async () => {
    const id = await pendingLeaveId();

    await adminAgent.patch(`/api/v1/leave/${id}/approve`).send({}).expect(200);

    const [row] = await Notification.find({ userId: employee._id }).lean();
    expect(row.type).toBe("leave_approved");
    expect(row.message).toMatch(/approved/i);
  });

  it("notifies the employee on DECLINE, with the reason", async () => {
    const id = await pendingLeaveId();

    await adminAgent.patch(`/api/v1/leave/${id}/decline`).send({ reason: "Too short notice" }).expect(200);

    const [row] = await Notification.find({ userId: employee._id }).lean();
    expect(row.type).toBe("leave_declined");
    expect(row.message).toMatch(/declined/i);
    expect(row.message).toContain("Too short notice");
  });

  /**
   * The new behaviour. This decision notified NOBODY, despite being the only
   * one that also sets `isDoubleDeduction` — the employee found out by
   * noticing their balance.
   */
  it("notifies the employee on MARK-UNAPPROVED-ABSENCE", async () => {
    const id = await pendingLeaveId();

    await adminAgent.patch(`/api/v1/leave/${id}/mark-unapproved-absence`).send({}).expect(200);

    const rows = await Notification.find({ userId: employee._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("leave_unapproved_absence");
  });

  it("says UNAPPROVED ABSENCE, not 'approved' — the handler sets status:approved internally", async () => {
    const id = await pendingLeaveId();

    await adminAgent.patch(`/api/v1/leave/${id}/mark-unapproved-absence`).send({}).expect(200);

    const [row] = await Notification.find({ userId: employee._id }).lean();
    expect(row.message).toMatch(/unapproved absence/i);
    expect(row.message).toMatch(/double/i);
    // Calling this "approved" would be worse than saying nothing.
    expect(row.message).not.toMatch(/\bhas been approved\b/i);
  });

  it("notifies nobody when the decider IS the subject", async () => {
    // Built through the model because admins cannot self-request through the
    // API — this exercises the self-skip branch directly.
    const own = await Leave.create({
      employeeId: admin._id,
      startDate: new Date("2027-06-01"),
      endDate: new Date("2027-06-02"),
      type: "unpaid",
      reason: "admin's own",
      status: "pending",
    });

    await adminAgent.patch(`/api/v1/leave/${own._id}/mark-unapproved-absence`).send({}).expect(200);

    expect(await Notification.countDocuments({})).toBe(0);
  });

  it("lets a manager mark their own team member's absence, notifying that employee", async () => {
    const id = await pendingLeaveId();

    await managerAgent.patch(`/api/v1/leave/${id}/mark-unapproved-absence`).send({}).expect(200);

    const rows = await Notification.find({ userId: employee._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("leave_unapproved_absence");
  });
});
