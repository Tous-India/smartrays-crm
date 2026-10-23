import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// Complaints redesign (2026-10-23), the staff side: the assigners' list
// (admin + complaints.assign), assigning with priority and visit date, the
// technician's "My complaints", status steps, photos, send-back — every
// change in the history and notified.

const uploadComplaintPhoto = vi.fn(async () => ({ publicId: `smartrays/complaints/fake-${Math.random()}` }));
vi.mock("../../services/cloudinary.service.js", () => ({
  signedAttendancePhotoUrl: vi.fn((publicId) => (publicId ? `https://signed.test/${publicId}` : null)),
  signedComplaintPhotoUrl: vi.fn((publicId) => (publicId ? `https://signed.test/${publicId}` : null)),
  signedVisitPhotoUrl: vi.fn((publicId) => (publicId ? `https://signed.test/${publicId}` : null)),
  uploadTicketAttachment: vi.fn(async () => "https://fake.cloudinary.test/attachment.pdf"),
  uploadComplaintPhoto: (...args) => uploadComplaintPhoto(...args),
  uploadVisitPhoto: vi.fn(async () => ({ publicId: "visit" })),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const NOT_AN_IMAGE = Buffer.from("this is plain text pretending to be a photo");

let app;
let Ticket, Customer, Notification, User;
let vinay, coordinator, manager, suresh, ravi, customerUser;
let vinayAgent, coordinatorAgent, managerAgent, sureshAgent, raviAgent;

async function raise(fields = {}) {
  const req = request(app)
    .post("/api/v1/public/complaints")
    .field("kind", "complaint")
    .field("name", fields.name || "Ramesh Sharma")
    .field("phone", fields.phone || "98100 12345")
    .field("address", fields.address || "B-12, Sector 7, Dwarka, New Delhi")
    .field("companyName", fields.companyName || "Sharma household")
    .field("description", fields.description || "Inverter shows a red light since morning.");
  const response = await req.expect(201);
  await mongoose.connection.db.collection("ratelimithits").deleteMany({});
  return Ticket.findOne({ number: response.body.data.number }).lean();
}

const assignBody = (overrides = {}) => ({ assignedToId: suresh._id, priority: "high", visitDate: "2026-10-25", ...overrides });

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  ({ default: Ticket } = await import("./ticket.model.js"));
  ({ default: Customer } = await import("../customer/customer.model.js"));
  ({ default: Notification } = await import("../notification/notification.model.js"));
  ({ default: User } = await import("../user/user.model.js"));

  vinay = await createUserDirectly({ name: "Vinay Gupta", email: "vinay@test.local", password: "AdminPass123!", role: "admin" });
  coordinator = await createUserDirectly({
    name: "Office Coordinator",
    email: "coord@test.local",
    password: "Password123",
    role: "employee",
    permissions: { complaints: { view_all: true, assign: true } },
  });
  manager = await createUserDirectly({
    name: "Ticket Manager",
    email: "mgr@test.local",
    password: "Password123",
    role: "manager",
    permissions: { tickets: { create: true, assign: true, view_all: true } },
  });
  suresh = await createUserDirectly({ name: "Suresh Kumar", email: "suresh@test.local", password: "Password123", role: "employee" });
  ravi = await createUserDirectly({ name: "Ravi Verma", email: "ravi@test.local", password: "Password123", role: "employee" });
  customerUser = await createUserDirectly({ name: "Portal Customer", email: "cust@test.local", password: "Password123", role: "customer" });

  vinayAgent = await loginAsAgent(app, "vinay@test.local", "AdminPass123!");
  coordinatorAgent = await loginAsAgent(app, "coord@test.local", "Password123");
  managerAgent = await loginAsAgent(app, "mgr@test.local", "Password123");
  sureshAgent = await loginAsAgent(app, "suresh@test.local", "Password123");
  raviAgent = await loginAsAgent(app, "ravi@test.local", "Password123");
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await Ticket.deleteMany({});
  await Customer.deleteMany({});
  await Notification.deleteMany({});
  await mongoose.connection.db.collection("ratelimithits").deleteMany({}).catch(() => {});
});

describe("GET /complaints — the list", () => {
  it("shows assigners every complaint, unassigned first then newest, with the fields the list needs", async () => {
    const older = await raise({ description: "Older complaint, will be assigned." });
    await vinayAgent.patch(`/api/v1/complaints/${older._id}/assign`).send(assignBody()).expect(200);
    const unassigned = await raise({ name: "Meena Joshi", phone: "98765 43210", description: "Panels look dusty and output is low." });

    const response = await vinayAgent.get("/api/v1/complaints").expect(200);
    const rows = response.body.data;
    expect(rows.map((row) => row.number)).toEqual([unassigned.number, older.number]);
    expect(rows[0]).toMatchObject({
      status: "open",
      contactName: "Meena Joshi",
      contactPhone: "98765 43210",
      description: "Panels look dusty and output is low.",
      assigneeName: null,
      priority: null,
    });
    expect(rows[1]).toMatchObject({ status: "assigned", priority: "high", assigneeName: "Suresh Kumar", visitDate: "2026-10-25" });

    const coordinatorRows = (await coordinatorAgent.get("/api/v1/complaints").expect(200)).body.data;
    expect(coordinatorRows).toHaveLength(2);
  });

  it("filters Unassigned / Assigned / Resolved", async () => {
    const a = await raise();
    const b = await raise();
    const c = await raise();
    await vinayAgent.patch(`/api/v1/complaints/${b._id}/assign`).send(assignBody()).expect(200);
    await vinayAgent.patch(`/api/v1/complaints/${c._id}/assign`).send(assignBody()).expect(200);
    await sureshAgent.patch(`/api/v1/complaints/${c._id}/status`).send({ status: "resolved" }).expect(200);

    const numbers = async (filter) =>
      (await vinayAgent.get(`/api/v1/complaints?filter=${filter}`).expect(200)).body.data.map((row) => row.number);
    expect(await numbers("unassigned")).toEqual([a.number]);
    expect(await numbers("assigned")).toEqual([b.number]);
    expect(await numbers("resolved")).toEqual([c.number]);
  });

  it("shows a technician only the complaints assigned to them ('My complaints')", async () => {
    const mine = await raise();
    const notMine = await raise();
    await vinayAgent.patch(`/api/v1/complaints/${mine._id}/assign`).send(assignBody()).expect(200);
    await vinayAgent.patch(`/api/v1/complaints/${notMine._id}/assign`).send(assignBody({ assignedToId: ravi._id })).expect(200);

    const rows = (await sureshAgent.get("/api/v1/complaints").expect(200)).body.data;
    expect(rows.map((row) => row.number)).toEqual([mine.number]);
  });

  it("does not show complaints through the old tickets list, even to a manager with tickets.view_all", async () => {
    await raise();
    const tickets = (await managerAgent.get("/api/v1/tickets?scope=all").expect(200)).body.data;
    expect(tickets).toHaveLength(0);
    expect((await managerAgent.get("/api/v1/complaints").expect(200)).body.data).toHaveLength(0);
  });
});

describe("GET /complaints/:id — the detail", () => {
  it("has everything the customer sent, the matched customer, photos and the history with names", async () => {
    await Customer.create({
      companyName: "Sharma Residence",
      ownerId: vinay._id,
      projectManagerId: vinay._id,
      phone: "+91 98100 12345",
      commissioningDate: new Date("2025-03-14"),
    });
    const ticket = await raise();
    await vinayAgent.patch(`/api/v1/complaints/${ticket._id}/assign`).send(assignBody()).expect(200);

    const detail = (await vinayAgent.get(`/api/v1/complaints/${ticket._id}`).expect(200)).body.data;
    expect(detail).toMatchObject({
      number: ticket.number,
      status: "assigned",
      priority: "high",
      visitDate: "2026-10-25",
      contactName: "Ramesh Sharma",
      contactPhone: "98100 12345",
      address: "B-12, Sector 7, Dwarka, New Delhi",
      description: "Inverter shows a red light since morning.",
      matchedCustomer: { companyName: "Sharma Residence" },
      assignedTo: { name: "Suresh Kumar" },
      assignedBy: { name: "Vinay Gupta" },
      canAssign: true,
    });
    expect(detail.matchedCustomer.commissioningDate).toContain("2025-03-14");
    expect(detail.history.map((entry) => [entry.type, entry.by])).toEqual([
      ["comment", "Customer"],
      ["assigned", "Vinay Gupta"],
    ]);
  });

  it("is 404 for someone who neither holds complaints.view_all nor is the assignee", async () => {
    const ticket = await raise();
    await vinayAgent.patch(`/api/v1/complaints/${ticket._id}/assign`).send(assignBody()).expect(200);
    await raviAgent.get(`/api/v1/complaints/${ticket._id}`).expect(404);
    await managerAgent.get(`/api/v1/complaints/${ticket._id}`).expect(404);
    const asTechnician = (await sureshAgent.get(`/api/v1/complaints/${ticket._id}`).expect(200)).body.data;
    expect(asTechnician.canAssign).toBe(false);
    expect(asTechnician.canWork).toBe(true);
  });
});

describe("PATCH /complaints/:id/assign", () => {
  it("assigns with priority and visit date, logs it, and tells the technician who assigned it", async () => {
    const ticket = await raise({ name: "Sharma ji" });
    await vinayAgent.patch(`/api/v1/complaints/${ticket._id}/assign`).send(assignBody()).expect(200);

    const stored = await Ticket.findById(ticket._id).lean();
    expect(stored).toMatchObject({ status: "assigned", priority: "high", visitDate: "2026-10-25" });
    expect(String(stored.assignedToId)).toBe(String(suresh._id));
    expect(String(stored.assignedById)).toBe(String(vinay._id));

    const note = await Notification.findOne({ userId: suresh._id, type: "complaint_assigned" }).lean();
    expect(note.message).toBe("Vinay Gupta assigned you a complaint — High priority, visit 25 Oct — Sharma ji, B-12, Sector 7, Dwarka, New Delhi");
    expect(note.relatedEntity.module).toBe("complaints");
  });

  it("can reassign later; the previous technician is told", async () => {
    const ticket = await raise();
    await vinayAgent.patch(`/api/v1/complaints/${ticket._id}/assign`).send(assignBody()).expect(200);
    await coordinatorAgent
      .patch(`/api/v1/complaints/${ticket._id}/assign`)
      .send(assignBody({ assignedToId: ravi._id, priority: "urgent", visitDate: "2026-10-24" }))
      .expect(200);

    const stored = await Ticket.findById(ticket._id).lean();
    expect(String(stored.assignedToId)).toBe(String(ravi._id));
    expect(await Notification.exists({ userId: ravi._id, type: "complaint_assigned" })).toBeTruthy();
    expect(await Notification.exists({ userId: suresh._id, type: "complaint_status" })).toBeTruthy();
  });

  it("is refused without complaints.assign — technicians, and a manager with tickets.assign", async () => {
    const ticket = await raise();
    await sureshAgent.patch(`/api/v1/complaints/${ticket._id}/assign`).send(assignBody()).expect(403);
    await managerAgent.patch(`/api/v1/complaints/${ticket._id}/assign`).send(assignBody()).expect(403);
  });

  it("validates the technician, priority and visit date", async () => {
    const ticket = await raise();
    const url = `/api/v1/complaints/${ticket._id}/assign`;
    await vinayAgent.patch(url).send(assignBody({ priority: "whenever" })).expect(400);
    await vinayAgent.patch(url).send(assignBody({ visitDate: "25/10/2026" })).expect(400);
    await vinayAgent.patch(url).send(assignBody({ visitDate: undefined })).expect(400);
    await vinayAgent.patch(url).send(assignBody({ assignedToId: customerUser._id })).expect(400);
    await User.updateOne({ _id: ravi._id }, { $set: { isActive: false } });
    await vinayAgent.patch(url).send(assignBody({ assignedToId: ravi._id })).expect(400);
    await User.updateOne({ _id: ravi._id }, { $set: { isActive: true } });
  });

  it("offers every active staff member in the picker, not customers", async () => {
    const people = (await vinayAgent.get("/api/v1/complaints/assignees").expect(200)).body.data;
    const names = people.map((person) => person.name);
    expect(names).toEqual(expect.arrayContaining(["Suresh Kumar", "Ravi Verma", "Ticket Manager", "Vinay Gupta"]));
    expect(names).not.toContain("Portal Customer");
    await sureshAgent.get("/api/v1/complaints/assignees").expect(403);
  });
});

describe("the technician works it", () => {
  async function assigned() {
    const ticket = await raise();
    await vinayAgent.patch(`/api/v1/complaints/${ticket._id}/assign`).send(assignBody()).expect(200);
    await Notification.deleteMany({});
    return ticket;
  }

  it("moves Assigned → On the way → Working → Resolved; each step is logged and notified to the assigners", async () => {
    const ticket = await assigned();
    const url = `/api/v1/complaints/${ticket._id}/status`;
    await sureshAgent.patch(url).send({ status: "on_the_way" }).expect(200);
    await sureshAgent.patch(url).send({ status: "working" }).expect(200);
    await sureshAgent.patch(url).send({ status: "resolved", note: "Replaced the inverter fuse." }).expect(200);

    const stored = await Ticket.findById(ticket._id).lean();
    expect(stored.status).toBe("resolved");
    expect(stored.resolvedAt).toBeTruthy();
    expect(stored.history.filter((entry) => entry.type === "status_change").map((entry) => entry.toStatus)).toEqual([
      "on_the_way",
      "working",
      "resolved",
    ]);
    expect(stored.history.at(-1).comment).toBe("Replaced the inverter fuse.");

    const toVinay = await Notification.find({ userId: vinay._id, type: "complaint_status" }).lean();
    const toCoordinator = await Notification.find({ userId: coordinator._id, type: "complaint_status" }).lean();
    expect(toVinay).toHaveLength(3);
    expect(toCoordinator).toHaveLength(3);
    expect(toVinay.at(-1).message).toMatch(/Suresh Kumar.*resolved/i);
  });

  it("does not go backwards, and only the assignee (or an assigner) may change it", async () => {
    const ticket = await assigned();
    const url = `/api/v1/complaints/${ticket._id}/status`;
    await sureshAgent.patch(url).send({ status: "working" }).expect(200);
    await sureshAgent.patch(url).send({ status: "on_the_way" }).expect(400);
    await sureshAgent.patch(url).send({ status: "open" }).expect(400);
    await raviAgent.patch(url).send({ status: "resolved" }).expect(404);
  });

  it("adds live photos (checked images only)", async () => {
    const ticket = await assigned();
    const url = `/api/v1/complaints/${ticket._id}/photos`;
    await sureshAgent.post(url).attach("photo", JPEG, "site.jpg").expect(201);
    await sureshAgent.post(url).attach("photo", NOT_AN_IMAGE, "fake.jpg").expect(400);
    await raviAgent.post(url).attach("photo", JPEG, "site.jpg").expect(404);

    const detail = (await vinayAgent.get(`/api/v1/complaints/${ticket._id}`).expect(200)).body.data;
    expect(detail.staffPhotos).toHaveLength(1);
    expect(detail.staffPhotos[0]).toMatchObject({ by: "Suresh Kumar" });
    expect(detail.staffPhotos[0].url).toMatch(/^https:\/\/signed\.test\//);
  });

  it("sends it back to the assigners with a required reason", async () => {
    const ticket = await assigned();
    const url = `/api/v1/complaints/${ticket._id}/send-back`;
    await sureshAgent.post(url).send({}).expect(400);
    await sureshAgent.post(url).send({ reason: "Not my area — this is a billing question." }).expect(200);

    const stored = await Ticket.findById(ticket._id).lean();
    expect(stored.status).toBe("open");
    expect(stored.assignedToId).toBeNull();
    expect(stored.history.at(-1)).toMatchObject({ type: "sent_back", comment: "Not my area — this is a billing question." });

    const note = await Notification.findOne({ userId: vinay._id, type: "complaint_sent_back" }).lean();
    expect(note.message).toContain("Not my area — this is a billing question.");
    await sureshAgent.get(`/api/v1/complaints/${ticket._id}`).expect(404);
  });
});
