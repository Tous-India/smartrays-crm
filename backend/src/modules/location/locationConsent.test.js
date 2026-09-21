import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";

/**
 * The location-consent record (final-plan.md §7.73): the employee's own
 * append-only decisions on the tracking disclosure, the latest one readable
 * back, and the latest per employee visible to whoever may view their
 * location. Through HTTP only, so the file runs — and fails — against the
 * code before the endpoints existed.
 */

vi.mock("../../services/cloudinary.service.js", () => ({
  signedAttendancePhotoUrl: vi.fn(() => null),
  uploadAttendancePhoto: vi.fn(async () => ({ secureUrl: "x", publicId: "y" })),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));

let app;
let adminAgent, managerAgent, employeeAgent, outsiderAgent;
let manager, employee, outsider;

const CONSENT = "/api/v1/location/consent";

function consents() {
  return mongoose.connection.db.collection("locationconsents");
}

function decision(overrides = {}) {
  return { decision: "granted", disclosureVersion: "2026-09-21.1", appVersion: "0.0.1", deviceId: "phone-1", ...overrides };
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  await createUserDirectly({ name: "Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  manager = await createUserDirectly({
    name: "Manager",
    email: "manager@test.local",
    password: "Password123",
    role: "manager",
    permissions: { location: { view: true, view_team: true } },
  });
  employee = await createUserDirectly({
    name: "Employee",
    email: "employee@test.local",
    password: "Password123",
    role: "employee",
    managerId: manager._id,
    permissions: { location: { view: true } },
  });
  outsider = await createUserDirectly({
    name: "Outsider",
    email: "outsider@test.local",
    password: "Password123",
    role: "employee",
    permissions: { location: { view: true } },
  });

  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");
  managerAgent = await loginAsAgent(app, "manager@test.local", "Password123");
  employeeAgent = await loginAsAgent(app, "employee@test.local", "Password123");
  outsiderAgent = await loginAsAgent(app, "outsider@test.local", "Password123");
});

afterEach(async () => {
  await consents().deleteMany({});
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("POST /location/consent", () => {
  it("records the caller's decision with the disclosure version, app version, device and time — attributed to the session, never the body", async () => {
    const response = await employeeAgent.post(CONSENT).send({ ...decision(), userId: String(outsider._id) }).expect(201);

    expect(response.body.data).toMatchObject({
      userId: String(employee._id),
      decision: "granted",
      disclosureVersion: "2026-09-21.1",
      appVersion: "0.0.1",
      deviceId: "phone-1",
    });
    expect(response.body.data.recordedAt).toBeTruthy();

    const stored = await consents().find({}).toArray();
    expect(stored).toHaveLength(1);
    expect(String(stored[0].userId)).toBe(String(employee._id));
  });

  it("is APPEND-ONLY: a new decision adds a record and the history stays", async () => {
    await employeeAgent.post(CONSENT).send(decision({ decision: "declined" })).expect(201);
    await employeeAgent.post(CONSENT).send(decision({ decision: "granted" })).expect(201);
    await employeeAgent.post(CONSENT).send(decision({ decision: "declined", disclosureVersion: "2026-10-01.1" })).expect(201);

    const stored = await consents().find({ userId: employee._id }).sort({ createdAt: 1 }).toArray();
    expect(stored.map((one) => one.decision)).toEqual(["declined", "granted", "declined"]);
  });

  it("validates: decision must be granted or declined, disclosureVersion is required, the rest are optional strings", async () => {
    await employeeAgent.post(CONSENT).send(decision({ decision: "maybe" })).expect(400);
    await employeeAgent.post(CONSENT).send(decision({ disclosureVersion: "" })).expect(400);
    await employeeAgent.post(CONSENT).send(decision({ appVersion: 7 })).expect(400);
    await employeeAgent.post(CONSENT).send({ decision: "declined", disclosureVersion: "v1" }).expect(201);
  });

  it("requires a session", async () => {
    await (await import("supertest")).default(app).post(CONSENT).send(decision()).expect(401);
  });
});

describe("GET /location/consent/me", () => {
  it("returns null before any decision, then the LATEST one", async () => {
    const before = await employeeAgent.get(`${CONSENT}/me`).expect(200);
    expect(before.body.data).toBeNull();

    await employeeAgent.post(CONSENT).send(decision({ decision: "declined" })).expect(201);
    await employeeAgent.post(CONSENT).send(decision({ decision: "granted", disclosureVersion: "2026-09-21.2" })).expect(201);

    const after = await employeeAgent.get(`${CONSENT}/me`).expect(200);
    expect(after.body.data).toMatchObject({ decision: "granted", disclosureVersion: "2026-09-21.2" });
  });
});

describe("GET /location/consent — the latest decision per employee, scoped like the live map", () => {
  it("admin sees every field employee, including those who have never answered", async () => {
    await employeeAgent.post(CONSENT).send(decision({ decision: "granted" })).expect(201);

    const response = await adminAgent.get(CONSENT).expect(200);
    const byEmail = Object.fromEntries(response.body.data.map((row) => [row.email, row]));

    expect(byEmail["employee@test.local"]).toMatchObject({ decision: "granted", disclosureVersion: "2026-09-21.1" });
    expect(byEmail["outsider@test.local"]).toMatchObject({ decision: null });
    expect(byEmail["manager@test.local"]).toMatchObject({ decision: null });
    expect(byEmail["admin@test.local"]).toBeUndefined();
  });

  it("a manager sees only their own team (and themselves), never an unaffiliated employee", async () => {
    await outsiderAgent.post(CONSENT).send(decision({ decision: "granted" })).expect(201);

    const response = await managerAgent.get(CONSENT).expect(200);
    const emails = response.body.data.map((row) => row.email).sort();

    expect(emails).toEqual(["employee@test.local", "manager@test.local"]);
  });

  it("an employee with location.view only sees themselves", async () => {
    const response = await employeeAgent.get(CONSENT).expect(200);

    expect(response.body.data.map((row) => row.email)).toEqual(["employee@test.local"]);
  });
});
