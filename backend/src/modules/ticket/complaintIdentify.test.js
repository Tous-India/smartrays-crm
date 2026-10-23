import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// Complaint form, who is complaining (2026-10-23, afternoon):
// - phone first; a check says only matched / not matched (strictly limited);
// - not matched → "Company or household name" and the address are required,
//   enforced by the server too;
// - the per-customer link with a code is back: customer known, prefilled;
// - Vinay's side: the typed name, similar customers, link the complaint to a
//   customer, then save the number as that customer's contact.

vi.mock("../../services/cloudinary.service.js", () => ({
  signedAttendancePhotoUrl: vi.fn((publicId) => (publicId ? `https://signed.test/${publicId}` : null)),
  signedComplaintPhotoUrl: vi.fn((publicId) => (publicId ? `https://signed.test/${publicId}` : null)),
  signedVisitPhotoUrl: vi.fn((publicId) => (publicId ? `https://signed.test/${publicId}` : null)),
  uploadTicketAttachment: vi.fn(async () => "https://fake.cloudinary.test/attachment.pdf"),
  uploadComplaintPhoto: vi.fn(async () => ({ publicId: `smartrays/complaints/fake-${Math.random()}` })),
  uploadVisitPhoto: vi.fn(async () => ({ publicId: "visit" })),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));

const PUBLIC = "/api/v1/public/complaints";
let app;
let Ticket, Customer, Contact, Lead;
let admin, vinayAgent, technicianAgent;
let gupta, sharma;

const clearLimits = () => mongoose.connection.db.collection("ratelimithits").deleteMany({});
const check = (phone) => request(app).post(`${PUBLIC}/check-phone`).send({ phone });

function submit(fields) {
  const req = request(app).post(PUBLIC);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) req.field(key, String(value));
  }
  return req;
}

const base = (overrides = {}) => ({
  kind: "complaint",
  name: "Mohit Bansal",
  phone: "98111 22333",
  description: "Our bill shows more units than the meter reading.",
  ...overrides,
});

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  ({ default: Ticket } = await import("./ticket.model.js"));
  ({ default: Customer } = await import("../customer/customer.model.js"));
  ({ default: Contact } = await import("../customer/contact.model.js"));
  ({ default: Lead } = await import("../lead/lead.model.js"));

  admin = await createUserDirectly({ name: "Vinay Gupta", email: "vinay@test.local", password: "AdminPass123!", role: "admin" });
  await createUserDirectly({ name: "Suresh Kumar", email: "suresh@test.local", password: "Password123", role: "employee" });
  vinayAgent = await loginAsAgent(app, "vinay@test.local", "AdminPass123!");
  technicianAgent = await loginAsAgent(app, "suresh@test.local", "Password123");
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await Ticket.deleteMany({});
  await Customer.deleteMany({});
  await Contact.deleteMany({});
  await Lead.deleteMany({});
  await clearLimits();
  gupta = await Customer.create({
    companyName: "Gupta Industries",
    ownerId: admin._id,
    projectManagerId: admin._id,
    phone: "+91 98765 00001",
    siteAddress: "Plot 7, Okhla Phase 2",
  });
  sharma = await Customer.create({ companyName: "Sharma Residence", ownerId: admin._id, projectManagerId: admin._id, phone: "011-2345 6789" });
  await Contact.create({ customerId: sharma._id, name: "Rajesh Sharma", phone: "098990 20000", isPrimary: true });
});

describe("POST /public/complaints/check-phone", () => {
  it("says only matched / not matched — customer phone or a contact's — and never any customer data", async () => {
    const byCustomer = await check("+91 98765-00001").expect(200);
    expect(byCustomer.body.data).toEqual({ matched: true });
    const byContact = await check("9899020000").expect(200);
    expect(byContact.body.data).toEqual({ matched: true });
    const none = await check("98111 22333").expect(200);
    expect(none.body.data).toEqual({ matched: false });

    for (const response of [byCustomer, byContact]) {
      const body = JSON.stringify(response.body);
      expect(body).not.toMatch(/Gupta|Sharma|Okhla|[a-f0-9]{24}/);
    }
  });

  it("wants a complete 10-digit number after +91, a leading 0, spaces and dashes", async () => {
    await check("0 98765 00001").expect(200);
    await check("98765").expect(400);
    await check("+1 415 555 0100 22").expect(400);
    await check("").expect(400);
  });

  it("is strictly limited per address (10 per 15 minutes)", async () => {
    for (let i = 0; i < 10; i += 1) {
      await check(`98111 2${String(i).padStart(4, "0")}`).expect(200);
    }
    const blocked = await check("98111 29999").expect(429);
    expect(blocked.body.message).toMatch(/try again/i);
  });

  it("is limited overall too, whatever the address (300 an hour)", async () => {
    const { default: RateLimitHit } = await import("../../middlewares/rateLimit.middleware.js");
    const windowStart = new Date(Math.floor(Date.now() / 3600000) * 3600000);
    await RateLimitHit.create({ key: "complaint-check-all:all", windowStart, count: 300, expiresAt: new Date(Date.now() + 7200000) });
    await check("98111 22333").expect(429);
  });
});

describe("POST /public/complaints — who is complaining", () => {
  it("a matched number needs no company name and no address", async () => {
    const response = await submit(base({ phone: "98765 00001" })).expect(201);
    const ticket = await Ticket.findOne({ number: response.body.data.number }).lean();
    expect(String(ticket.customerId)).toBe(String(gupta._id));
    expect(ticket.companyName).toBeNull();
  });

  it("an unmatched number without a company or household name is refused — even straight to the API", async () => {
    const refused = await submit(base({ address: "Shop 4, Main Market, Rohini" })).expect(400);
    expect(refused.body.message).toBe("Please enter your company or household name.");
    expect(await Ticket.countDocuments()).toBe(0);
  });

  it("an unmatched number also needs the address", async () => {
    await clearLimits();
    const refused = await submit(base({ companyName: "Bansal Stores" })).expect(400);
    expect(refused.body.message).toBe("Please enter your address.");
  });

  it("an unmatched number with both is accepted, and the name is kept for Vinay", async () => {
    const response = await submit(base({ companyName: "Bansal Stores", address: "Shop 4, Main Market, Rohini" })).expect(201);
    const ticket = await Ticket.findOne({ number: response.body.data.number }).lean();
    expect(ticket.customerId).toBeNull();
    expect(ticket.companyName).toBe("Bansal Stores");
  });

  it("the same rule holds for a new requirement; the lead gets the company name", async () => {
    await submit(base({ kind: "requirement", address: "Rohini" })).expect(400);
    await submit(base({ kind: "requirement", companyName: "Bansal Stores", address: "Rohini" })).expect(201);
    expect((await Lead.findOne().lean()).companyName).toBe("Bansal Stores");
  });
});

describe("the per-customer link (with a code) is back", () => {
  async function linkFor(customer) {
    const response = await vinayAgent.get(`/api/v1/customers/${customer._id}/complaint-link`).expect(200);
    return response.body.data.url.split("/c/")[1];
  }

  it("prefills the form for that customer — and nothing for a wrong code", async () => {
    const token = await linkFor(sharma);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const page = await request(app).get(`${PUBLIC}/link/${token}`).expect(200);
    expect(page.body.data).toEqual({
      customerName: "Sharma Residence",
      contactName: "Rajesh Sharma",
      phone: "098990 20000",
      address: null,
    });
    expect(JSON.stringify(page.body)).not.toMatch(/[a-f0-9]{24}/);
    await request(app).get(`${PUBLIC}/link/${"A".repeat(32)}`).expect(404);
  });

  it("a complaint through it belongs to that customer, whatever phone is typed; no company name asked", async () => {
    const token = await linkFor(gupta);
    const response = await submit({ ...base({ phone: "98111 22333" }), linkToken: token }).expect(201);
    const ticket = await Ticket.findOne({ number: response.body.data.number }).lean();
    expect(String(ticket.customerId)).toBe(String(gupta._id));
    expect(response.body.data.statusToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("a wrong code is refused, not silently treated as the public form", async () => {
    await submit({ ...base({ companyName: "X", address: "Y place" }), linkToken: "A".repeat(32) }).expect(404);
  });
});

describe("Vinay's side for an unmatched complaint", () => {
  async function unmatched() {
    const response = await submit(base({ companyName: "Gupta Industry", address: "Okhla" })).expect(201);
    return Ticket.findOne({ number: response.body.data.number }).lean();
  }

  it("shows the typed name and suggests similar customers", async () => {
    const ticket = await unmatched();
    const detail = (await vinayAgent.get(`/api/v1/complaints/${ticket._id}`).expect(200)).body.data;
    expect(detail.companyName).toBe("Gupta Industry");
    expect(detail.matchedCustomer).toBeNull();
    expect(detail.suggestedCustomers.map((c) => c.companyName)).toEqual(["Gupta Industries"]);
  });

  it("links it to a customer, then offers to save the number as that customer's contact", async () => {
    const ticket = await unmatched();
    const linked = (await vinayAgent.patch(`/api/v1/complaints/${ticket._id}/customer`).send({ customerId: gupta._id }).expect(200)).body.data;
    expect(linked.matchedCustomer.companyName).toBe("Gupta Industries");
    expect(linked.canSaveContact).toBe(true);
    expect(linked.history.at(-1)).toMatchObject({ type: "linked", by: "Vinay Gupta" });

    const saved = (await vinayAgent.post(`/api/v1/complaints/${ticket._id}/save-contact`).expect(200)).body.data;
    expect(saved.canSaveContact).toBe(false);
    const contact = await Contact.findOne({ customerId: gupta._id, phone: "98111 22333" }).lean();
    expect(contact.name).toBe("Mohit Bansal");

    // Now the same number matches.
    await clearLimits();
    expect((await check("98111 22333").expect(200)).body.data).toEqual({ matched: true });
  });

  it("only assigners link or save; a customer search helps find the right one", async () => {
    const ticket = await unmatched();
    await technicianAgent.patch(`/api/v1/complaints/${ticket._id}/customer`).send({ customerId: gupta._id }).expect(403);
    await technicianAgent.post(`/api/v1/complaints/${ticket._id}/save-contact`).expect(403);
    const found = (await vinayAgent.get("/api/v1/complaints/customer-options?search=shar").expect(200)).body.data;
    expect(found.map((c) => c.companyName)).toEqual(["Sharma Residence"]);
    await technicianAgent.get("/api/v1/complaints/customer-options?search=shar").expect(403);
  });
});
