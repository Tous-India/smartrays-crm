import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// Complaints redesign (2026-10-23): ONE public complaint form for every
// customer, no login. "Complaint / problem" becomes a complaint for the
// assigners (admin + anyone holding complaints.assign); "New requirement"
// becomes a lead for sales. The phone number is matched to an existing
// customer. The customer gets a number and a private status link.

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
const FORM = "/api/v1/public/complaints";

let app;
let Ticket, Customer, Contact, Lead, Notification, User;
let admin, secondAdmin, coordinator, manager, technician;
let adminAgent;

function submit(fields, photos = []) {
  const req = request(app).post(FORM);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) req.field(key, String(value));
  }
  photos.forEach((buffer, index) => req.attach("photos", buffer, `photo-${index}.jpg`));
  return req;
}

const complaint = (overrides = {}) => ({
  kind: "complaint",
  name: "Ramesh Sharma",
  phone: "98100 12345",
  address: "B-12, Sector 7, Dwarka, New Delhi",
  description: "Inverter shows a red light since morning.",
  callbackTime: "morning",
  ...overrides,
});

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  ({ default: Ticket } = await import("./ticket.model.js"));
  ({ default: Customer } = await import("../customer/customer.model.js"));
  ({ default: Contact } = await import("../customer/contact.model.js"));
  ({ default: Lead } = await import("../lead/lead.model.js"));
  ({ default: Notification } = await import("../notification/notification.model.js"));
  ({ default: User } = await import("../user/user.model.js"));

  admin = await createUserDirectly({ name: "Vinay Admin", email: "vinay@test.local", password: "AdminPass123!", role: "admin" });
  secondAdmin = await createUserDirectly({ name: "Second Admin", email: "admin2@test.local", password: "AdminPass123!", role: "admin" });
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
  technician = await createUserDirectly({ name: "Suresh Kumar", email: "tech@test.local", password: "Password123", role: "employee" });
  adminAgent = await loginAsAgent(app, "vinay@test.local", "AdminPass123!");
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await Ticket.deleteMany({});
  await Customer.deleteMany({});
  await Contact.deleteMany({});
  await Lead.deleteMany({});
  await Notification.deleteMany({});
  await mongoose.connection.db.collection("ratelimithits").deleteMany({}).catch(() => {});
  uploadComplaintPhoto.mockClear();
});

describe("POST /public/complaints — a complaint", () => {
  it("creates a complaint with a number and an unguessable status token, and exposes no internal ids", async () => {
    const response = await submit(complaint(), [JPEG]).expect(201);
    const data = response.body.data;

    expect(data.kind).toBe("complaint");
    expect(typeof data.number).toBe("number");
    expect(data.statusToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(response.body)).not.toMatch(/[a-f0-9]{24}/);

    const ticket = await Ticket.findOne({ number: data.number }).lean();
    expect(ticket.source).toBe("complaint_link");
    expect(ticket.status).toBe("open");
    expect(ticket.assignedToId).toBeNull();
    expect(ticket.customerId).toBeNull();
    expect(ticket.contactName).toBe("Ramesh Sharma");
    expect(ticket.contactPhone).toBe("98100 12345");
    expect(ticket.address).toBe("B-12, Sector 7, Dwarka, New Delhi");
    expect(ticket.callbackTime).toBe("morning");
    expect(ticket.customerPhotos).toHaveLength(1);
    // Only a hash of the status token is stored.
    expect(JSON.stringify(ticket)).not.toContain(data.statusToken);
  });

  it("stores the optional GPS location when given, and rejects an impossible one", async () => {
    const response = await submit(complaint({ lat: 28.5921, lng: 77.046, locationAccuracy: 12 })).expect(201);
    const ticket = await Ticket.findOne({ number: response.body.data.number }).lean();
    expect(ticket.location).toMatchObject({ lat: 28.5921, lng: 77.046, accuracy: 12 });

    await submit(complaint({ lat: 128, lng: 77 })).expect(400);
  });

  it("matches the phone number to an existing customer (customer phone or a contact's phone)", async () => {
    const sharma = await Customer.create({
      companyName: "Sharma Residence",
      ownerId: admin._id,
      projectManagerId: admin._id,
      phone: "+91 98100 12345",
      commissioningDate: new Date("2025-03-14"),
    });
    const first = await submit(complaint()).expect(201);
    expect((await Ticket.findOne({ number: first.body.data.number })).customerId).toEqual(sharma._id);

    const gupta = await Customer.create({ companyName: "Gupta Traders", ownerId: admin._id,
      projectManagerId: admin._id, phone: "011 2345 6789" });
    await Contact.create({ customerId: gupta._id, name: "Anil Gupta", phone: "+91-99999-88888" });
    const second = await submit(complaint({ phone: "9999988888" })).expect(201);
    expect((await Ticket.findOne({ number: second.body.data.number })).customerId).toEqual(gupta._id);
  });

  it("notifies the admins and everyone holding complaints.assign — not a manager who only has tickets.assign", async () => {
    await submit(complaint()).expect(201);
    const notified = (await Notification.find({ type: "complaint_new" }).lean()).map((n) => String(n.userId));

    expect(notified.sort()).toEqual([String(admin._id), String(secondAdmin._id), String(coordinator._id)].sort());
    expect(notified).not.toContain(String(manager._id));
    expect(notified).not.toContain(String(technician._id));
  });

  it("validates every field in plain words", async () => {
    // Every attempt counts toward the 5-an-hour limit, valid or not.
    const resetLimit = () => mongoose.connection.db.collection("ratelimithits").deleteMany({});
    await submit(complaint({ name: "" })).expect(400);
    await submit(complaint({ phone: "12" })).expect(400);
    await submit(complaint({ phone: "call me" })).expect(400);
    await resetLimit();
    await submit(complaint({ address: "" })).expect(400);
    await submit(complaint({ description: "bad" })).expect(400);
    await submit(complaint({ kind: "something" })).expect(400);
    await submit(complaint({ callbackTime: "midnight" })).expect(400);
    await resetLimit();
    const notImage = await submit(complaint(), [NOT_AN_IMAGE]).expect(400);
    expect(notImage.body.message).toMatch(/photos/i);
    const tooMany = await submit(complaint(), [JPEG, JPEG, JPEG, JPEG]).expect(400);
    expect(tooMany.body.message).toMatch(/up to 3/);
    expect(await Ticket.countDocuments()).toBe(0);
  });

  it("limits how many complaints one address can send in an hour", async () => {
    for (let i = 0; i < 5; i += 1) {
      await submit(complaint()).expect(201);
    }
    await submit(complaint()).expect(429);
  });
});

describe("POST /public/complaints — a new requirement", () => {
  it("creates a lead for sales (source 'Website complaint form'), not a complaint", async () => {
    const response = await submit(
      complaint({ kind: "requirement", description: "Want 2 more panels on the roof.", callbackTime: "evening" })
    ).expect(201);

    expect(response.body.data).toEqual({ kind: "requirement" });
    expect(await Ticket.countDocuments()).toBe(0);

    const lead = await Lead.findOne().lean();
    expect(lead.name).toBe("Ramesh Sharma");
    expect(lead.phone).toBe("98100 12345");
    expect(lead.source).toBe("Website complaint form");
    expect(String(lead.ownerId)).toBe(String(admin._id));
    expect(lead.siteAddress).toBe("B-12, Sector 7, Dwarka, New Delhi");
    expect(lead.notes).toContain("Want 2 more panels on the roof.");
    expect(lead.notes).toMatch(/evening/i);

    const { default: LeadSource } = await import("../lead/leadSource.model.js");
    expect(await LeadSource.exists({ name: "Website complaint form" })).toBeTruthy();
  });
});

describe("GET /public/complaints/status/:token", () => {
  it("shows the customer the step, the technician's first name and visit date — nothing internal", async () => {
    const raised = await submit(complaint()).expect(201);
    const { number, statusToken } = raised.body.data;

    const before = await request(app).get(`${FORM}/status/${statusToken}`).expect(200);
    expect(before.body.data).toMatchObject({ number, status: "received", technicianName: null, visitDate: null });

    await Ticket.updateOne(
      { number },
      { $set: { status: "assigned", assignedToId: technician._id, visitDate: "2026-10-25", priority: "high" } }
    );
    const after = await request(app).get(`${FORM}/status/${statusToken}`).expect(200);
    expect(after.body.data).toMatchObject({ number, status: "assigned", technicianName: "Suresh", visitDate: "2026-10-25" });

    const body = JSON.stringify(after.body);
    expect(body).not.toMatch(/[a-f0-9]{24}/);
    expect(body).not.toContain("priority");
    expect(body).not.toContain("98100");
    expect(body).not.toContain("Kumar");
  });

  it("answers every unknown or malformed token with the same 404", async () => {
    const a = await request(app).get(`${FORM}/status/${"A".repeat(43)}`).expect(404);
    const b = await request(app).get(`${FORM}/status/short`).expect(404);
    expect(a.body.message).toBe(b.body.message);
  });
});

describe("the per-customer links are gone", () => {
  it("no longer serves a customer's own complaint link", async () => {
    const customer = await Customer.create({ companyName: "Old Link Co", ownerId: admin._id, projectManagerId: admin._id });
    await adminAgent.get(`/api/v1/customers/${customer._id}/complaint-link`).expect(404);
  });
});
