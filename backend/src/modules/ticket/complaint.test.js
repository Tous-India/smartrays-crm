import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// Customer complaint link (Instruction #1, Phase 2, 2026-10-22): a per-customer
// public link where a customer raises a complaint without logging in; the
// ticket is routed to the right employee and escalated if nobody acts.

const uploadComplaintPhoto = vi.fn(async () => ({ publicId: `smartrays/complaints/fake-${Date.now()}-${Math.random()}` }));
vi.mock("../../services/cloudinary.service.js", () => ({
  signedAttendancePhotoUrl: vi.fn((publicId) => (publicId ? `https://signed.test/${publicId}` : null)),
  signedComplaintPhotoUrl: vi.fn((publicId) => (publicId ? `https://signed.test/${publicId}` : null)),
  uploadTicketAttachment: vi.fn(async () => "https://fake.cloudinary.test/attachment.pdf"),
  uploadComplaintPhoto: (...args) => uploadComplaintPhoto(...args),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const NOT_AN_IMAGE = Buffer.from("this is plain text pretending to be a photo");

let app;
let Ticket, Customer, Contact, User, Notification;
let adminAgent, ownerAgent, pmAgent, outsiderAgent;
let admin, secondAdmin, salesManager, owner, pm, outsider;
let customer;

const pub = (path) => `/api/v1/public/complaints/${path}`;
const tokenFromUrl = (url) => url.split("/c/")[1];

async function linkFor(customerId, agent = adminAgent) {
  const response = await agent.get(`/api/v1/customers/${customerId}/complaint-link`).expect(200);
  return { url: response.body.data.url, token: tokenFromUrl(response.body.data.url) };
}

async function makeCustomer(overrides = {}) {
  return Customer.create({
    companyName: "Sharma Residence",
    ownerId: owner._id,
    projectManagerId: pm._id,
    phone: "+91 90000 00001",
    email: "sharma@example.test",
    ...overrides,
  });
}

beforeAll(async () => {
  await startTestDatabase();
  process.env.CRON_SECRET = "test-cron-secret";
  app = await getTestApp();

  ({ default: Ticket } = await import("./ticket.model.js"));
  ({ default: Customer } = await import("../customer/customer.model.js"));
  ({ default: Contact } = await import("../customer/contact.model.js"));
  ({ default: User } = await import("../user/user.model.js"));
  ({ default: Notification } = await import("../notification/notification.model.js"));

  admin = await createUserDirectly({ name: "Owner Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  secondAdmin = await createUserDirectly({ name: "Second Admin", email: "admin2@test.local", password: "AdminPass123!", role: "admin" });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");

  const register = async (name, email, role) =>
    (await adminAgent.post("/api/v1/auth/register").send({ name, email, password: "Password123", role }).expect(201)).body.data;

  salesManager = await register("Sales Manager", "salesmgr@test.local", "manager");
  owner = await register("Account Owner", "owner@test.local", "employee");
  pm = await register("Project Manager", "pm@test.local", "employee");
  outsider = await register("Someone Else", "outsider@test.local", "employee");
  await User.updateMany({ _id: { $in: [owner._id, pm._id] } }, { $set: { managerId: salesManager._id } });

  ownerAgent = await loginAsAgent(app, "owner@test.local", "Password123");
  pmAgent = await loginAsAgent(app, "pm@test.local", "Password123");
  outsiderAgent = await loginAsAgent(app, "outsider@test.local", "Password123");
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await Ticket.deleteMany({});
  await Notification.deleteMany({});
  await Customer.deleteMany({});
  await Contact.deleteMany({});
  await User.updateMany({}, { $set: { isActive: true } });
  await mongoose.connection.db.collection("ratelimithits").deleteMany({}).catch(() => {});
  await mongoose.connection.db.collection("ticketdigests").deleteMany({}).catch(() => {});
  uploadComplaintPhoto.mockClear();
  customer = await makeCustomer();
});

describe("Complaint link — staff side", () => {
  it("gives an admin a shareable link with an unguessable token, stable across calls", async () => {
    const first = await linkFor(customer._id);
    const second = await linkFor(customer._id);

    expect(first.url).toMatch(/\/c\/[A-Za-z0-9_-]{32}$/);
    expect(second.url).toBe(first.url);
  });

  it("lets the customer's own account owner fetch it, but not an employee outside the customer's scope", async () => {
    await linkFor(customer._id, ownerAgent);
    await outsiderAgent.get(`/api/v1/customers/${customer._id}/complaint-link`).expect(404);
  });

  it("never stores the token in readable form on the customer", async () => {
    const { token } = await linkFor(customer._id);
    const raw = await mongoose.connection.db.collection("customers").findOne({ _id: customer._id });

    expect(JSON.stringify(raw)).not.toContain(token);
  });

  it("resetting the link issues a new token and kills the old one", async () => {
    const { token: oldToken } = await linkFor(customer._id);
    const reset = await adminAgent.post(`/api/v1/customers/${customer._id}/complaint-link/reset`).expect(200);
    const newToken = tokenFromUrl(reset.body.data.url);

    expect(newToken).not.toBe(oldToken);
    await request(app).get(pub(oldToken)).expect(404);
    await request(app).get(pub(newToken)).expect(200);
  });
});

describe("Complaint page — public, no login", () => {
  it("shows the customer's name and nothing else about them", async () => {
    const { token } = await linkFor(customer._id);
    const response = await request(app).get(pub(token)).expect(200);

    expect(response.body.data).toEqual({ customerName: "Sharma Residence", complaints: [] });
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(String(customer._id));
    expect(body).not.toContain("sharma@example.test");
    expect(body).not.toContain("+91 90000 00001");
  });

  it("answers a wrong, malformed or deactivated link with the same plain 404", async () => {
    const { token } = await linkFor(customer._id);
    const wrong = await request(app).get(pub("A".repeat(32))).expect(404);
    const malformed = await request(app).get(pub("not-a-token")).expect(404);

    await Customer.updateOne({ _id: customer._id }, { $set: { customerStatus: "inactive" } });
    const inactive = await request(app).get(pub(token)).expect(404);

    expect(wrong.body.message).toBe(malformed.body.message);
    expect(inactive.body.message).toBe(wrong.body.message);
    expect(wrong.body.data ?? null).toBeNull();
  });
});

describe("Raising a complaint — routing", () => {
  // Not async: returns the unsent supertest request so callers can chain .expect().
  function raise(token, fields) {
    const call = request(app).post(pub(token));
    Object.entries(fields).forEach(([key, value]) => call.field(key, value));
    return call;
  }

  it("routes Technical to the project manager, notifies them, and does not notify the admin", async () => {
    const { token } = await linkFor(customer._id);
    const response = await raise(token, { category: "technical", description: "Inverter shows a red light since morning", callbackTime: "evening" }).expect(201);

    expect(response.body.data.number).toEqual(expect.any(Number));
    expect(response.body.data.status).toBe("received");
    expect(JSON.stringify(response.body)).not.toMatch(/[a-f0-9]{24}/);

    const ticket = await Ticket.findOne({ number: response.body.data.number });
    expect(String(ticket.assignedToId)).toBe(String(pm._id));
    expect(ticket.source).toBe("complaint_link");
    expect(ticket.callbackTime).toBe("evening");

    const pmNotes = await Notification.find({ userId: pm._id, type: "complaint_assigned" });
    expect(pmNotes).toHaveLength(1);
    expect(await Notification.countDocuments({ userId: admin._id })).toBe(0);
  });

  it.each([
    ["sales_billing", "owner"],
    ["installation", "pm"],
    ["other", "owner"],
  ])("routes %s to the %s", async (category, who) => {
    const { token } = await linkFor(customer._id);
    const response = await raise(token, { category, description: "Please call me about this issue" }).expect(201);
    const ticket = await Ticket.findOne({ number: response.body.data.number });

    expect(String(ticket.assignedToId)).toBe(String(who === "owner" ? owner._id : pm._id));
  });

  it("falls back to the other person when the preferred one is inactive, and to the admin when neither is active", async () => {
    const { token } = await linkFor(customer._id);

    await User.updateOne({ _id: pm._id }, { $set: { isActive: false } });
    const toOwner = await raise(token, { category: "technical", description: "Panels look dirty and output is low" }).expect(201);
    expect(String((await Ticket.findOne({ number: toOwner.body.data.number })).assignedToId)).toBe(String(owner._id));

    await User.updateOne({ _id: owner._id }, { $set: { isActive: false } });
    const toAdmin = await raise(token, { category: "technical", description: "Panels look dirty and output is low" }).expect(201);
    expect(String((await Ticket.findOne({ number: toAdmin.body.data.number })).assignedToId)).toBe(String(admin._id));
  });

  it("numbers complaints in sequence", async () => {
    const { token } = await linkFor(customer._id);
    const a = await raise(token, { category: "other", description: "First complaint here" }).expect(201);
    const b = await raise(token, { category: "other", description: "Second complaint here" }).expect(201);

    expect(b.body.data.number).toBe(a.body.data.number + 1);
  });

  it("rejects a missing or unknown problem type and a too-short description", async () => {
    const { token } = await linkFor(customer._id);

    await raise(token, { description: "No category given here" }).expect(400);
    await raise(token, { category: "refund", description: "Unknown category given" }).expect(400);
    await raise(token, { category: "technical", description: "hi" }).expect(400);
  });

  it("refuses to create anything on a wrong link", async () => {
    await raise("B".repeat(32), { category: "technical", description: "Should never be stored" }).expect(404);
    expect(await Ticket.countDocuments({})).toBe(0);
  });
});

describe("Raising a complaint — photos", () => {
  it("accepts up to three real images and stores them privately", async () => {
    const { token } = await linkFor(customer._id);
    const response = await request(app)
      .post(pub(token))
      .field("category", "technical")
      .field("description", "Wire burnt near the inverter")
      .attach("photos", JPEG, { filename: "a.jpg", contentType: "image/jpeg" })
      .attach("photos", PNG, { filename: "b.png", contentType: "image/png" })
      .expect(201);

    const ticket = await Ticket.findOne({ number: response.body.data.number });
    expect(ticket.customerPhotos).toHaveLength(2);
    expect(uploadComplaintPhoto).toHaveBeenCalledTimes(2);
  });

  it("rejects a file that is not really an image, whatever it is called", async () => {
    const { token } = await linkFor(customer._id);
    await request(app)
      .post(pub(token))
      .field("category", "technical")
      .field("description", "Wire burnt near the inverter")
      .attach("photos", NOT_AN_IMAGE, { filename: "photo.jpg", contentType: "image/jpeg" })
      .expect(400);

    expect(uploadComplaintPhoto).not.toHaveBeenCalled();
    expect(await Ticket.countDocuments({})).toBe(0);
  });

  it("rejects more than three photos, and a photo over 5 MB", async () => {
    const { token } = await linkFor(customer._id);
    const four = request(app).post(pub(token)).field("category", "technical").field("description", "Too many photos here");
    for (let i = 0; i < 4; i += 1) four.attach("photos", JPEG, { filename: `p${i}.jpg`, contentType: "image/jpeg" });
    await four.expect(400);

    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    await request(app)
      .post(pub(token))
      .field("category", "technical")
      .field("description", "One very large photo")
      .attach("photos", big, { filename: "big.jpg", contentType: "image/jpeg" })
      .expect(400);

    expect(await Ticket.countDocuments({})).toBe(0);
  });
});

describe("Customer sees the status on the same link", () => {
  it("shows Received, then In progress, then Resolved as staff work it", async () => {
    const { token } = await linkFor(customer._id);
    const raised = await request(app).post(pub(token)).field("category", "technical").field("description", "Inverter beeping all night").expect(201);
    const ticket = await Ticket.findOne({ number: raised.body.data.number });

    const statusOnPage = async () => (await request(app).get(pub(token)).expect(200)).body.data.complaints[0].status;

    expect(await statusOnPage()).toBe("received");
    await pmAgent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "in_progress" }).expect(200);
    expect(await statusOnPage()).toBe("in_progress");
    await pmAgent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "resolved", comment: "Replaced the fuse" }).expect(200);
    expect(await statusOnPage()).toBe("resolved");

    const page = (await request(app).get(pub(token))).body.data.complaints[0];
    expect(page).toEqual({
      number: raised.body.data.number,
      category: "technical",
      status: "resolved",
      raisedAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("records when it was acknowledged and when it was resolved", async () => {
    const { token } = await linkFor(customer._id);
    const raised = await request(app).post(pub(token)).field("category", "technical").field("description", "Inverter beeping all night").expect(201);
    const ticket = await Ticket.findOne({ number: raised.body.data.number });

    await pmAgent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "in_progress" }).expect(200);
    const acknowledged = await Ticket.findById(ticket._id);
    expect(acknowledged.acknowledgedAt).toBeInstanceOf(Date);
    expect(acknowledged.resolvedAt ?? null).toBeNull();

    await pmAgent.patch(`/api/v1/tickets/${ticket._id}/status`).send({ status: "resolved" }).expect(200);
    expect((await Ticket.findById(ticket._id)).resolvedAt).toBeInstanceOf(Date);
  });
});

describe("Rate limiting", () => {
  it("stops a sixth complaint from the same address within the hour", async () => {
    const { token } = await linkFor(customer._id);
    for (let i = 0; i < 5; i += 1) {
      await request(app).post(pub(token)).field("category", "other").field("description", `Complaint number ${i}`).expect(201);
    }
    const blocked = await request(app).post(pub(token)).field("category", "other").field("description", "One too many").expect(429);

    expect(blocked.body.message).toMatch(/try again/i);
    expect(await Ticket.countDocuments({})).toBe(5);
  });
});

describe("Escalation", () => {
  const HOUR = 3600000;

  async function complaintAged(hours, { status = "open", assignedToId = owner._id } = {}) {
    const ticket = await Ticket.create({
      subject: "Technical — test",
      customerId: customer._id,
      category: "technical",
      source: "complaint_link",
      number: Math.floor(Math.random() * 1e6),
      assignedToId,
      status,
      acknowledgedAt: status === "open" ? null : new Date(Date.now() - (hours - 1) * HOUR),
    });
    await Ticket.collection.updateOne({ _id: ticket._id }, { $set: { createdAt: new Date(Date.now() - hours * HOUR) } });
    return ticket;
  }

  async function run() {
    const { runTicketEscalations } = await import("./ticketEscalation.service.js");
    return runTicketEscalations(new Date());
  }

  it("tells the assignee's manager when nobody has acknowledged it in 4 hours — not the admin, and only once", async () => {
    await complaintAged(5);
    await run();
    await run();

    expect(await Notification.countDocuments({ userId: salesManager._id, type: "complaint_escalated" })).toBe(1);
    expect(await Notification.countDocuments({ userId: admin._id })).toBe(0);
  });

  it("tells the admins 4 hours after that if it is still not acknowledged", async () => {
    await complaintAged(9);
    await run();

    expect(await Notification.countDocuments({ userId: salesManager._id, type: "complaint_escalated" })).toBe(1);
    expect(await Notification.countDocuments({ userId: admin._id, type: "complaint_escalated" })).toBe(1);
    expect(await Notification.countDocuments({ userId: secondAdmin._id, type: "complaint_escalated" })).toBe(1);
  });

  it("does not escalate an acknowledged complaint before the resolve deadline", async () => {
    await complaintAged(10, { status: "in_progress" });
    await run();

    expect(await Notification.countDocuments({ type: "complaint_escalated" })).toBe(0);
  });

  it("escalates an acknowledged complaint that is still not resolved after 48 hours", async () => {
    const ticket = await complaintAged(49, { status: "in_progress" });
    await run();

    const notes = await Notification.find({ userId: salesManager._id, type: "complaint_escalated" });
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/not resolved/i);
    expect((await Ticket.findById(ticket._id)).escalations.map((e) => `${e.kind}:${e.level}`)).toContain("resolve:manager");
  });

  it("goes straight to the admins when the assignee has no manager", async () => {
    await complaintAged(5, { assignedToId: outsider._id });
    await run();

    expect(await Notification.countDocuments({ userId: admin._id, type: "complaint_escalated" })).toBe(1);
  });

  it("never escalates a resolved complaint", async () => {
    await complaintAged(100, { status: "resolved" });
    await run();

    expect(await Notification.countDocuments({ type: "complaint_escalated" })).toBe(0);
  });
});

describe("Daily summary for the admin", () => {
  it("sends each admin one summary a day", async () => {
    const { sendDailyComplaintSummary } = await import("./ticketEscalation.service.js");
    const tenAmIst = new Date("2026-10-22T04:30:00Z");

    await sendDailyComplaintSummary(tenAmIst);
    await sendDailyComplaintSummary(new Date(tenAmIst.getTime() + 3600000));

    expect(await Notification.countDocuments({ userId: admin._id, type: "complaint_daily_summary" })).toBe(1);
    expect(await Notification.countDocuments({ userId: secondAdmin._id, type: "complaint_daily_summary" })).toBe(1);
  });

  it("does not send before 9 AM India time", async () => {
    const { sendDailyComplaintSummary } = await import("./ticketEscalation.service.js");
    await sendDailyComplaintSummary(new Date("2026-10-22T02:00:00Z")); // 07:30 IST

    expect(await Notification.countDocuments({ type: "complaint_daily_summary" })).toBe(0);
  });
});

describe("Daily backstop endpoint (Vercel Cron)", () => {
  it("refuses without the machine credential and runs with it", async () => {
    await request(app).get("/api/v1/tickets/escalations/run").expect(401);
    const response = await request(app)
      .get("/api/v1/tickets/escalations/run")
      .set("Authorization", "Bearer test-cron-secret")
      .expect(200);

    expect(response.body.data).toEqual(expect.objectContaining({ escalated: expect.any(Number) }));
  });
});

describe("Staff complaint detail", () => {
  it("shows the assignee who to call, the problem, and signed photo links; hides it from others", async () => {
    await Contact.create({ customerId: customer._id, name: "Rajesh Sharma", phone: "+91 98990 11111", isPrimary: true });
    const { token } = await linkFor(customer._id);
    const raised = await request(app)
      .post(pub(token))
      .field("category", "technical")
      .field("description", "Inverter beeping all night")
      .field("callbackTime", "morning")
      .attach("photos", JPEG, { filename: "a.jpg", contentType: "image/jpeg" })
      .expect(201);
    const ticket = await Ticket.findOne({ number: raised.body.data.number });

    const detail = (await pmAgent.get(`/api/v1/tickets/${ticket._id}`).expect(200)).body.data;
    expect(detail.customer.companyName).toBe("Sharma Residence");
    expect(detail.customer.primaryContact).toEqual({ name: "Rajesh Sharma", phone: "+91 98990 11111" });
    expect(detail.description).toBe("Inverter beeping all night");
    expect(detail.callbackTime).toBe("morning");
    expect(detail.photoUrls).toHaveLength(1);
    expect(detail.photoUrls[0]).toMatch(/^https:\/\/signed\.test\//);

    await outsiderAgent.get(`/api/v1/tickets/${ticket._id}`).expect(404);
  });
});
