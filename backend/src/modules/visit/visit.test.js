import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// Verified site visits (Instruction #1, Phase 3, 2026-10-22): a visit is
// assigned by an admin or manager; the employee can tap Arrived and Done only
// inside the site's geofence; photos carry GPS and time; the office sees
// Verified / Left early / Not at site / Not started next to the real route.

const uploadVisitPhoto = vi.fn(async () => ({ publicId: `smartrays/visits/fake-${Math.random()}` }));
vi.mock("../../services/cloudinary.service.js", () => ({
  signedAttendancePhotoUrl: vi.fn((id) => (id ? `https://signed.test/${id}` : null)),
  signedComplaintPhotoUrl: vi.fn((id) => (id ? `https://signed.test/${id}` : null)),
  signedVisitPhotoUrl: vi.fn((id) => (id ? `https://signed.test/${id}` : null)),
  uploadTicketAttachment: vi.fn(async () => "https://fake.test/a.pdf"),
  uploadComplaintPhoto: vi.fn(async () => ({ publicId: "c" })),
  uploadVisitPhoto: (...args) => uploadVisitPhoto(...args),
  uploadAttendancePhoto: vi.fn(async () => ({ secureUrl: "https://fake.test/p.jpg", publicId: "p" })),
  deleteCloudinaryAsset: vi.fn(async () => ({ result: "ok" })),
}));

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const SITE = { lat: 28.4949, lng: 77.0937 }; // DLF Phase 3, Gurugram
const AT_SITE = { lat: 28.4951, lng: 77.0939, accuracy: 12 }; // ~30 m away
const DELHI_OUTING = { lat: 28.6315, lng: 77.2167, accuracy: 10 }; // Connaught Place, ~19 km
const VAGUE = { lat: 28.4949, lng: 77.0937, accuracy: 300 };
const DAY = 24 * 3600000;

let app;
let Visit, Service, Customer, Attendance, LocationPing, Notification, User;
let adminAgent, managerAgent, employeeAgent, otherEmployeeAgent, outsiderManagerAgent;
let admin, manager, employee, otherEmployee, outsiderManager, customer;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  ({ default: Visit } = await import("./visit.model.js"));
  ({ default: Service } = await import("../service/service.model.js"));
  ({ default: Customer } = await import("../customer/customer.model.js"));
  ({ default: Attendance } = await import("../attendance/attendance.model.js"));
  ({ default: LocationPing } = await import("../location/location.model.js"));
  ({ default: Notification } = await import("../notification/notification.model.js"));
  ({ default: User } = await import("../user/user.model.js"));

  admin = await createUserDirectly({ name: "Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");
  const register = async (payload) =>
    (await adminAgent.post("/api/v1/auth/register").send({ password: "Password123", ...payload }).expect(201)).body.data;

  manager = await register({ name: "Install Manager", email: "manager@test.local", role: "manager" });
  outsiderManager = await register({ name: "Other Manager", email: "manager2@test.local", role: "manager" });
  employee = await register({ name: "Field Tech", email: "tech@test.local", role: "employee", managerId: manager._id });
  otherEmployee = await register({ name: "Other Tech", email: "tech2@test.local", role: "employee", managerId: manager._id });

  managerAgent = await loginAsAgent(app, "manager@test.local", "Password123");
  outsiderManagerAgent = await loginAsAgent(app, "manager2@test.local", "Password123");
  employeeAgent = await loginAsAgent(app, "tech@test.local", "Password123");
  otherEmployeeAgent = await loginAsAgent(app, "tech2@test.local", "Password123");
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await Promise.all([Visit.deleteMany({}), Service.deleteMany({}), Customer.deleteMany({}), Attendance.deleteMany({}), LocationPing.deleteMany({}), Notification.deleteMany({})]);
  uploadVisitPhoto.mockClear();
  customer = await Customer.create({ companyName: "Sharma Residence", ownerId: manager._id, projectManagerId: manager._id, siteAddress: "DLF Phase 3" });
});

async function openShift(user = employee) {
  return Attendance.create({ employeeId: user._id, date: new Date(), checkIn: { time: new Date(Date.now() - 2 * 3600000), coords: AT_SITE } });
}

// Not async: returns the unsent request so callers can chain .expect().
function assignVisit(overrides = {}, agent = managerAgent) {
  return agent.post("/api/v1/visits").send({
    customerId: String(customer._id),
    assignedToId: String(employee._id),
    purpose: "Site survey",
    dueDate: new Date().toISOString(),
    site: SITE,
    ...overrides,
  });
}

async function visitAt(overrides) {
  const response = await assignVisit(overrides).expect(201);
  return response.body.data;
}

const arrive = (visitId, coords, agent = employeeAgent) => agent.post(`/api/v1/visits/${visitId}/arrive`).send({ coords });
const photo = (visitId, coords, agent = employeeAgent, file = JPEG) =>
  agent
    .post(`/api/v1/visits/${visitId}/photos`)
    .field("coords", JSON.stringify(coords))
    .field("capturedAt", new Date().toISOString())
    .attach("photo", file, { filename: "site.jpg", contentType: "image/jpeg" });
const complete = (visitId, coords, notes = "Roof measured, meter photographed", agent = employeeAgent) =>
  agent.post(`/api/v1/visits/${visitId}/complete`).send({ coords, notes });

describe("Assigning a visit — reuses Services", () => {
  it("a manager assigns a visit to their own team: a Service is created for it and the employee is notified", async () => {
    const visit = await visitAt();

    expect(visit.status).toBe("not_started");
    const service = await Service.findById(visit.serviceId);
    expect(String(service.assignedToId)).toBe(String(employee._id));
    expect(service.title).toMatch(/Sharma Residence/);
    expect(await Notification.countDocuments({ userId: employee._id, type: "service_assigned" })).toBe(1);
  });

  it("a manager cannot assign outside their team, and an employee cannot assign at all", async () => {
    await assignVisit({}, outsiderManagerAgent).expect(400);
    await assignVisit({}, employeeAgent).expect(403);
    expect(await Visit.countDocuments({})).toBe(0);
    expect(await Service.countDocuments({})).toBe(0);
  });

  it("saves the picked site on the customer, and reuses it next time", async () => {
    await visitAt({ saveToCustomer: true });
    const saved = await Customer.findById(customer._id);
    expect(saved.siteLocation).toEqual(expect.objectContaining(SITE));

    const second = await visitAt({ site: undefined });
    expect(second.site).toEqual(expect.objectContaining(SITE));
  });

  it("needs a site location — picked, or saved on the customer", async () => {
    const response = await assignVisit({ site: undefined }).expect(400);
    expect(response.body.message).toMatch(/pick the site/i);
  });
});

describe("Arrived — only at the site", () => {
  it("is accepted inside the geofence during an open shift", async () => {
    await openShift();
    const visit = await visitAt();

    const response = await arrive(visit._id, AT_SITE).expect(200);

    expect(response.body.data.status).toBe("at_site");
    const stored = await Visit.findById(visit._id);
    expect(stored.arrival.at).toBeInstanceOf(Date);
    expect(stored.arrival.distanceMeters).toBeLessThan(100);
  });

  it("is refused from Delhi, with the distance in plain words, and nothing is stored", async () => {
    await openShift();
    const visit = await visitAt();

    const response = await arrive(visit._id, DELHI_OUTING).expect(409);

    expect(response.body.message).toMatch(/km from the site/);
    expect((await Visit.findById(visit._id)).arrival?.at ?? null).toBeNull();
  });

  it("is refused when the phone's location is too vague to say", async () => {
    await openShift();
    const visit = await visitAt();

    const response = await arrive(visit._id, VAGUE).expect(409);
    expect(response.body.message).toMatch(/not precise enough/i);
  });

  it("needs the employee to be checked in", async () => {
    const visit = await visitAt();
    const response = await arrive(visit._id, AT_SITE).expect(409);
    expect(response.body.message).toMatch(/check in/i);
  });

  it("is only for the person the visit is assigned to", async () => {
    await openShift(otherEmployee);
    const visit = await visitAt();
    await arrive(visit._id, AT_SITE, otherEmployeeAgent).expect(404);
  });
});

describe("Site photos — taken at the site, stamped with GPS and time", () => {
  it("are refused before Arrived, accepted at the site, refused from elsewhere", async () => {
    await openShift();
    const visit = await visitAt();

    await photo(visit._id, AT_SITE).expect(409);
    await arrive(visit._id, AT_SITE).expect(200);
    const accepted = await photo(visit._id, AT_SITE).expect(201);
    await photo(visit._id, DELHI_OUTING).expect(409);

    expect(accepted.body.data.photos).toHaveLength(1);
    const stored = await Visit.findById(visit._id);
    expect(stored.photos[0].coords.lat).toBeCloseTo(AT_SITE.lat, 4);
    expect(stored.photos[0].takenAt).toBeInstanceOf(Date);
    expect(stored.photos[0].receivedAt).toBeInstanceOf(Date);
  });

  it("must be real images", async () => {
    await openShift();
    const visit = await visitAt();
    await arrive(visit._id, AT_SITE).expect(200);

    await photo(visit._id, AT_SITE, employeeAgent, Buffer.from("not an image at all, just text")).expect(400);
    expect(uploadVisitPhoto).not.toHaveBeenCalled();
  });
});

describe("Done — only at the site, with a photo", () => {
  it("needs at least one photo, then completes the visit and its Service", async () => {
    await openShift();
    const visit = await visitAt();
    await arrive(visit._id, AT_SITE).expect(200);

    const noPhoto = await complete(visit._id, AT_SITE).expect(409);
    expect(noPhoto.body.message).toMatch(/photo/i);

    await photo(visit._id, AT_SITE).expect(201);
    const done = await complete(visit._id, AT_SITE).expect(200);

    expect(done.body.data.status).toBe("verified");
    expect(done.body.data.notes).toBe("Roof measured, meter photographed");
    expect((await Service.findById(visit.serviceId)).status).toBe("completed");
  });

  it("is refused away from the site", async () => {
    await openShift();
    const visit = await visitAt();
    await arrive(visit._id, AT_SITE).expect(200);
    await photo(visit._id, AT_SITE).expect(201);

    await complete(visit._id, DELHI_OUTING).expect(409);
  });
});

describe("What the office sees", () => {
  async function pingsAt(user, attendanceId, points) {
    await LocationPing.insertMany(points.map(([minutesAgo, coords]) => ({ employeeId: user._id, attendanceId, coords, capturedAt: new Date(Date.now() - minutesAgo * 60000) })));
  }

  it("Left early: the route shows the phone leaving the site between Arrived and Done", async () => {
    const shift = await openShift();
    const visit = await visitAt();
    await arrive(visit._id, AT_SITE).expect(200);
    await Visit.updateOne({ _id: visit._id }, { $set: { "arrival.at": new Date(Date.now() - 60 * 60000) } });
    await pingsAt(employee, shift._id, [[50, AT_SITE], [40, DELHI_OUTING], [30, DELHI_OUTING], [20, DELHI_OUTING]]);

    const detail = (await managerAgent.get(`/api/v1/visits/${visit._id}`).expect(200)).body.data;
    expect(detail.status).toBe("left_early");
  });

  it("one stray fix does not count as leaving", async () => {
    const shift = await openShift();
    const visit = await visitAt();
    await arrive(visit._id, AT_SITE).expect(200);
    await Visit.updateOne({ _id: visit._id }, { $set: { "arrival.at": new Date(Date.now() - 60 * 60000) } });
    await pingsAt(employee, shift._id, [[50, AT_SITE], [40, DELHI_OUTING], [30, AT_SITE]]);
    await photo(visit._id, AT_SITE).expect(201);
    await complete(visit._id, AT_SITE).expect(200);

    const detail = (await managerAgent.get(`/api/v1/visits/${visit._id}`).expect(200)).body.data;
    expect(detail.status).toBe("verified");
  });

  it("Not at site: the day passed with no Arrived; Not started: today, not yet", async () => {
    const past = await visitAt({ dueDate: new Date(Date.now() - 2 * DAY).toISOString() });
    const today = await visitAt();

    expect((await managerAgent.get(`/api/v1/visits/${past._id}`).expect(200)).body.data.status).toBe("not_at_site");
    expect((await managerAgent.get(`/api/v1/visits/${today._id}`).expect(200)).body.data.status).toBe("not_started");
  });

  it("lists a day's visits within each person's scope", async () => {
    await visitAt();
    await visitAt({ assignedToId: String(otherEmployee._id) });
    const day = new Date().toISOString().slice(0, 10);

    const asManager = (await managerAgent.get(`/api/v1/visits?date=${day}`).expect(200)).body.data;
    const asAdmin = (await adminAgent.get(`/api/v1/visits?date=${day}`).expect(200)).body.data;
    const asEmployee = (await employeeAgent.get(`/api/v1/visits?date=${day}`).expect(200)).body.data;
    const asOutsider = (await outsiderManagerAgent.get(`/api/v1/visits?date=${day}`).expect(200)).body.data;

    expect(asManager).toHaveLength(2);
    expect(asAdmin).toHaveLength(2);
    expect(asEmployee).toHaveLength(1);
    expect(asEmployee[0].assignee.name).toBe("Field Tech");
    expect(asEmployee[0].customer.companyName).toBe("Sharma Residence");
    expect(asOutsider).toHaveLength(0);
  });

  it("finds the visit behind a service, for the app", async () => {
    const visit = await visitAt();
    const found = (await employeeAgent.get(`/api/v1/visits?serviceId=${visit.serviceId}`).expect(200)).body.data;
    expect(found).toHaveLength(1);
    expect(found[0]._id).toBe(visit._id);
  });

  it("shows the photos as signed links with their GPS and time", async () => {
    await openShift();
    const visit = await visitAt();
    await arrive(visit._id, AT_SITE).expect(200);
    await photo(visit._id, AT_SITE).expect(201);

    const detail = (await managerAgent.get(`/api/v1/visits/${visit._id}`).expect(200)).body.data;
    expect(detail.photos[0].url).toMatch(/^https:\/\/signed\.test\//);
    expect(detail.photos[0].distanceMeters).toBeLessThan(100);
    expect(detail.photos[0].takenAt).toEqual(expect.any(String));
    expect(detail.radiusMeters).toEqual(expect.any(Number));
  });
});

describe("Customer picker for assigning visits", () => {
  it("offers a manager the customers their team owns OR manages as project manager — not others", async () => {
    const ownedElsewhere = await Customer.create({ companyName: "Someone Else's Client", ownerId: outsiderManager._id, projectManagerId: outsiderManager._id });
    await Customer.create({ companyName: "Team-managed Site", ownerId: outsiderManager._id, projectManagerId: employee._id });

    const options = (await managerAgent.get("/api/v1/visits/customer-options").expect(200)).body.data;
    const names = options.map((option) => option.companyName).sort();

    expect(names).toEqual(["Sharma Residence", "Team-managed Site"]);
    expect(options[0]).toEqual(expect.objectContaining({ _id: expect.any(String), companyName: expect.any(String) }));

    await assignVisit({ customerId: String(ownedElsewhere._id) }).expect(400);
  });

  it("offers the admin every active customer", async () => {
    await Customer.create({ companyName: "Inactive Co", ownerId: manager._id, projectManagerId: manager._id, customerStatus: "inactive" });
    const options = (await adminAgent.get("/api/v1/visits/customer-options").expect(200)).body.data;
    expect(options.map((option) => option.companyName)).toEqual(["Sharma Residence"]);
  });
});

describe("A visit's Service can only be completed by Done at the site", () => {
  it("refuses Mark complete on the Service while the visit is not done; Done at the site completes it", async () => {
    await openShift();
    const visit = await visitAt();

    const refused = await employeeAgent.patch(`/api/v1/services/${visit.serviceId}/status`).send({ status: "completed" }).expect(409);
    expect(refused.body.message).toMatch(/at the site/i);
    expect((await Service.findById(visit.serviceId)).status).toBe("todo");

    await arrive(visit._id, AT_SITE).expect(200);
    await photo(visit._id, AT_SITE).expect(201);
    await complete(visit._id, AT_SITE).expect(200);
    expect((await Service.findById(visit.serviceId)).status).toBe("completed");
  });

  it("leaves ordinary services alone", async () => {
    const plain = await managerAgent.post("/api/v1/services").send({ title: "Call the vendor", assignedToId: String(employee._id) }).expect(201);
    await employeeAgent.patch(`/api/v1/services/${plain.body.data._id}/status`).send({ status: "completed" }).expect(200);
  });
});
