import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import { bufferParser } from "../../../tests/helpers/binaryResponse.js";
import Lead from "./lead.model.js";
import LeadCall from "./leadCall.model.js";
import LeadSource from "./leadSource.model.js";
import Notification from "../notification/notification.model.js";

const FULL_LEADS_PERMISSIONS = { leads: { view: true, create: true, edit: true, delete: true } };

let app;
let adminAgent, managerAgent, sales1Agent, sales2Agent, sales3Agent, noPermAgent;
let manager1, sales1, sales2, sales3;

function buildLeadPayload(overrides = {}) {
  return {
    name: "Test Lead",
    email: "lead@example.com",
    phone: "1234567890",
    companyName: "Test Co",
    source: "Website",
    clientType: "residential",
    ...overrides,
  };
}

async function clearLeadData() {
  await Lead.deleteMany({});
  await LeadCall.deleteMany({});
  await LeadSource.deleteMany({});
  await Notification.deleteMany({});
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();

  await createUserDirectly({
    name: "Admin",
    email: "admin@test.local",
    password: "AdminPass123!",
    role: "admin",
  });
  adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");

  manager1 = await createUserDirectly({
    name: "Manager One",
    email: "manager1@test.local",
    password: "Password123",
    role: "manager",
    permissions: FULL_LEADS_PERMISSIONS,
  });
  managerAgent = await loginAsAgent(app, "manager1@test.local", "Password123");

  sales1 = await createUserDirectly({
    name: "Sales One",
    email: "sales1@test.local",
    password: "Password123",
    role: "sales_associate",
    managerId: manager1._id,
    permissions: FULL_LEADS_PERMISSIONS,
  });
  sales1Agent = await loginAsAgent(app, "sales1@test.local", "Password123");

  sales2 = await createUserDirectly({
    name: "Sales Two",
    email: "sales2@test.local",
    password: "Password123",
    role: "sales_associate",
    managerId: manager1._id,
    permissions: FULL_LEADS_PERMISSIONS,
  });
  sales2Agent = await loginAsAgent(app, "sales2@test.local", "Password123");

  // Deliberately NOT on manager1's team — used to prove manager scoping
  // doesn't leak across unrelated teams.
  sales3 = await createUserDirectly({
    name: "Sales Three",
    email: "sales3@test.local",
    password: "Password123",
    role: "sales_associate",
    permissions: FULL_LEADS_PERMISSIONS,
  });
  sales3Agent = await loginAsAgent(app, "sales3@test.local", "Password123");

  await createUserDirectly({
    name: "No Permission",
    email: "noperm@test.local",
    password: "Password123",
    role: "employee",
  });
  noPermAgent = await loginAsAgent(app, "noperm@test.local", "Password123");
});

// Users are fixtures shared across the whole file (expensive to recreate);
// only lead-related collections reset between tests.
afterEach(async () => {
  await clearLeadData();
});

afterAll(async () => {
  await stopTestDatabase();
});

describe("Lead CRUD", () => {
  it("sales1 can create a lead", async () => {
    const response = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    expect(response.status).toBe(201);
    expect(response.body.data.ownerId).toBe(String(sales1._id));
  });

  it("fails to create a lead without a name", async () => {
    const payload = buildLeadPayload();
    delete payload.name;

    const response = await sales1Agent.post("/api/v1/leads").send(payload);

    expect(response.status).toBe(400);
  });

  it("sales1 can read their own lead", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent.get(`/api/v1/leads/${created.body.data._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Test Lead");
  });

  it("sales1 can update their own lead", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent
      .patch(`/api/v1/leads/${created.body.data._id}`)
      .send({ notes: "Updated notes" });

    expect(response.status).toBe(200);
    expect(response.body.data.notes).toBe("Updated notes");
  });

  it("sales1 can delete their own lead", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const deleteResponse = await sales1Agent.delete(`/api/v1/leads/${created.body.data._id}`);
    expect(deleteResponse.status).toBe(200);

    const getResponse = await sales1Agent.get(`/api/v1/leads/${created.body.data._id}`);
    expect(getResponse.status).toBe(404);
  });
});

describe("Solar-specific fields", () => {
  it("creates a lead with the full set of solar fields", async () => {
    const response = await sales1Agent.post("/api/v1/leads").send(
      buildLeadPayload({
        clientType: "commercial",
        siteAddress: "123 Solar Lane",
        monthlyElectricityBill: 15000,
        estimatedUnitsConsumed: 900,
        estimatedCapacityKw: 10,
        roofType: "rcc",
        connectionType: "three_phase",
        subsidyApplicable: false,
        siteSurveyStatus: "scheduled",
        siteSurveyDate: new Date().toISOString(),
      })
    );

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      clientType: "commercial",
      siteAddress: "123 Solar Lane",
      monthlyElectricityBill: 15000,
      estimatedUnitsConsumed: 900,
      estimatedCapacityKw: 10,
      roofType: "rcc",
      connectionType: "three_phase",
      subsidyApplicable: false,
      siteSurveyStatus: "scheduled",
    });
  });

  it("rejects creating a lead with no clientType", async () => {
    const payload = buildLeadPayload();
    delete payload.clientType;

    const response = await sales1Agent.post("/api/v1/leads").send(payload);

    expect(response.status).toBe(400);
  });

  it("rejects an invalid clientType", async () => {
    const response = await sales1Agent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ clientType: "not_a_real_type" }));

    expect(response.status).toBe(400);
  });

  it("rejects an invalid roofType/connectionType/siteSurveyStatus", async () => {
    const badRoof = await sales1Agent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ roofType: "not_a_real_roof" }));
    expect(badRoof.status).toBe(400);

    const badConnection = await sales1Agent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ connectionType: "not_a_real_connection" }));
    expect(badConnection.status).toBe(400);

    const badSurveyStatus = await sales1Agent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ siteSurveyStatus: "not_a_real_status" }));
    expect(badSurveyStatus.status).toBe(400);
  });

  it("defaults siteSurveyStatus to not_scheduled and subsidyApplicable to false when omitted", async () => {
    const response = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    expect(response.body.data.siteSurveyStatus).toBe("not_scheduled");
    expect(response.body.data.subsidyApplicable).toBe(false);
  });

  it("updates solar fields via PATCH", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent.patch(`/api/v1/leads/${created.body.data._id}`).send({
      clientType: "industrial",
      estimatedCapacityKw: 50,
      siteSurveyStatus: "completed",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.clientType).toBe("industrial");
    expect(response.body.data.estimatedCapacityKw).toBe(50);
    expect(response.body.data.siteSurveyStatus).toBe("completed");
  });

  it("rejects clearing clientType to an empty value via PATCH", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent
      .patch(`/api/v1/leads/${created.body.data._id}`)
      .send({ clientType: "" });

    expect(response.status).toBe(400);
  });

  it("filters leads by clientType", async () => {
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "Residential Lead", clientType: "residential" }));
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "Commercial Lead", clientType: "commercial" }));

    const response = await sales1Agent.get("/api/v1/leads?clientType=commercial");

    expect(response.body.data.map((lead) => lead.name)).toEqual(["Commercial Lead"]);
  });

  it("still exposes exactly the same 7-stage status enum after adding solar fields (regression)", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());
    const id = created.body.data._id;

    const stages = ["contacted", "qualified", "proposal_sent", "negotiation"];
    for (const stage of stages) {
      const response = await sales1Agent.patch(`/api/v1/leads/${id}/status`).send({ status: stage });
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(stage);
    }

    const wonResponse = await sales1Agent.patch(`/api/v1/leads/${id}/status`).send({ status: "won" });
    expect(wonResponse.status).toBe(200);

    const invalidResponse = await sales1Agent
      .patch(`/api/v1/leads/${id}/status`)
      .send({ status: "not_a_real_status" });
    expect(invalidResponse.status).toBe(400);
  });

  it("listing/filtering still works with solar fields present (no regression)", async () => {
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "Listed Lead" }));

    const response = await sales1Agent.get("/api/v1/leads");

    expect(response.status).toBe(200);
    expect(response.body.data.map((lead) => lead.name)).toContain("Listed Lead");
  });
});

describe("Validation", () => {
  it("rejects creating with status=lost and no lostReason", async () => {
    const response = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ status: "lost" }));

    expect(response.status).toBe(400);
  });

  it("allows creating with status=lost when lostReason is given", async () => {
    const response = await sales1Agent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ status: "lost", lostReason: "Too expensive" }));

    expect(response.status).toBe(201);
    expect(response.body.data.lostReason).toBe("Too expensive");
  });

  it("rejects updating status to lost without lostReason", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent
      .patch(`/api/v1/leads/${created.body.data._id}`)
      .send({ status: "lost" });

    expect(response.status).toBe(400);
  });

  it("rejects PATCH /:id/status to lost without lostReason", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent
      .patch(`/api/v1/leads/${created.body.data._id}/status`)
      .send({ status: "lost" });

    expect(response.status).toBe(400);
  });

  it("accepts PATCH /:id/status to lost with lostReason", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent
      .patch(`/api/v1/leads/${created.body.data._id}/status`)
      .send({ status: "lost", lostReason: "No budget" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("lost");
    expect(response.body.data.lostReason).toBe("No budget");
  });
});

describe("Pipeline stage changes and hot flag", () => {
  it("allows a valid sequence of status transitions", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());
    const id = created.body.data._id;

    const toContacted = await sales1Agent.patch(`/api/v1/leads/${id}/status`).send({ status: "contacted" });
    expect(toContacted.status).toBe(200);
    expect(toContacted.body.data.status).toBe("contacted");

    const toQualified = await sales1Agent.patch(`/api/v1/leads/${id}/status`).send({ status: "qualified" });
    expect(toQualified.status).toBe(200);
    expect(toQualified.body.data.status).toBe("qualified");
  });

  it("rejects an invalid status value", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent
      .patch(`/api/v1/leads/${created.body.data._id}/status`)
      .send({ status: "not_a_real_status" });

    expect(response.status).toBe(400);
  });

  it("toggles isHot on and off", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());
    const id = created.body.data._id;

    const firstToggle = await sales1Agent.patch(`/api/v1/leads/${id}/hot`);
    expect(firstToggle.body.data.isHot).toBe(true);

    const secondToggle = await sales1Agent.patch(`/api/v1/leads/${id}/hot`);
    expect(secondToggle.body.data.isHot).toBe(false);
  });
});

describe("Call logging", () => {
  it("logs a call and it appears in call history", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());
    const id = created.body.data._id;

    const logResponse = await sales1Agent.post(`/api/v1/leads/${id}/calls`).send({
      calledAt: new Date().toISOString(),
      durationSeconds: 60,
      outcome: "connected",
      notes: "Good call",
    });
    expect(logResponse.status).toBe(201);

    const historyResponse = await sales1Agent.get(`/api/v1/leads/${id}/calls`);
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.data).toHaveLength(1);
    expect(historyResponse.body.data[0].outcome).toBe("connected");
  });

  it("rejects an invalid outcome", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent.post(`/api/v1/leads/${created.body.data._id}/calls`).send({
      calledAt: new Date().toISOString(),
      outcome: "not_a_real_outcome",
    });

    expect(response.status).toBe(400);
  });
});

describe("Filters", () => {
  it("search matches by name, company, email, and phone", async () => {
    await sales1Agent.post("/api/v1/leads").send(
      buildLeadPayload({
        name: "Alice Buyer",
        companyName: "Acme Co",
        email: "alice@example.com",
        phone: "1111111111",
      })
    );
    await sales1Agent.post("/api/v1/leads").send(
      buildLeadPayload({
        name: "Bob Buyer",
        companyName: "Beta Co",
        email: "bob@example.com",
        phone: "2222222222",
      })
    );

    const byName = await sales1Agent.get("/api/v1/leads?search=alice");
    expect(byName.body.data.map((lead) => lead.name)).toEqual(["Alice Buyer"]);

    const byCompany = await sales1Agent.get("/api/v1/leads?search=Beta");
    expect(byCompany.body.data.map((lead) => lead.name)).toEqual(["Bob Buyer"]);

    const byEmail = await sales1Agent.get("/api/v1/leads?search=alice@example.com");
    expect(byEmail.body.data.map((lead) => lead.name)).toEqual(["Alice Buyer"]);

    const byPhone = await sales1Agent.get("/api/v1/leads?search=2222222222");
    expect(byPhone.body.data.map((lead) => lead.name)).toEqual(["Bob Buyer"]);
  });

  it("owner filter returns only that owner's leads", async () => {
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "Sales1 Lead" }));
    await sales2Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "Sales2 Lead" }));

    const response = await adminAgent.get(`/api/v1/leads?owner=${sales1._id}`);

    expect(response.body.data.map((lead) => lead.name)).toEqual(["Sales1 Lead"]);
  });

  it("followUp today/overdue/this_week/none each return the right subset", async () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const inThreeDays = new Date(today);
    inThreeDays.setDate(inThreeDays.getDate() + 3);

    const withToday = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "Today Lead" }));
    await sales1Agent
      .patch(`/api/v1/leads/${withToday.body.data._id}`)
      .send({ followUpDate: today.toISOString() });

    const withOverdue = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "Overdue Lead" }));
    await sales1Agent
      .patch(`/api/v1/leads/${withOverdue.body.data._id}`)
      .send({ followUpDate: twoDaysAgo.toISOString() });

    const withThisWeek = await sales1Agent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ name: "This Week Lead" }));
    await sales1Agent
      .patch(`/api/v1/leads/${withThisWeek.body.data._id}`)
      .send({ followUpDate: inThreeDays.toISOString() });

    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "No Follow Up Lead" }));

    const todayResults = await sales1Agent.get("/api/v1/leads?followUp=today");
    expect(todayResults.body.data.map((lead) => lead.name)).toEqual(["Today Lead"]);

    const overdueResults = await sales1Agent.get("/api/v1/leads?followUp=overdue");
    expect(overdueResults.body.data.map((lead) => lead.name)).toEqual(["Overdue Lead"]);

    // "this_week" is a rolling 7-day window starting today (see lead.service.js),
    // so "Today Lead" is included alongside "This Week Lead".
    const thisWeekResults = await sales1Agent.get("/api/v1/leads?followUp=this_week");
    expect(thisWeekResults.body.data.map((lead) => lead.name).sort()).toEqual(
      ["This Week Lead", "Today Lead"].sort()
    );

    const noneResults = await sales1Agent.get("/api/v1/leads?followUp=none");
    expect(noneResults.body.data.map((lead) => lead.name)).toEqual(["No Follow Up Lead"]);
  });
});

describe("Permission scoping", () => {
  it("admin sees all leads", async () => {
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S1 Lead" }));
    await sales2Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S2 Lead" }));
    await sales3Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S3 Lead" }));

    const response = await adminAgent.get("/api/v1/leads");

    expect(response.body.data.map((lead) => lead.name).sort()).toEqual(
      ["S1 Lead", "S2 Lead", "S3 Lead"].sort()
    );
  });

  it("manager sees only leads owned by their direct reports, not an unaffiliated sales associate", async () => {
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S1 Lead" }));
    await sales2Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S2 Lead" }));
    await sales3Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S3 Lead" }));

    const response = await managerAgent.get("/api/v1/leads");

    expect(response.body.data.map((lead) => lead.name).sort()).toEqual(["S1 Lead", "S2 Lead"].sort());
  });

  it("sales_associate sees only their own leads", async () => {
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S1 Lead" }));
    await sales2Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S2 Lead" }));

    const response = await sales1Agent.get("/api/v1/leads");

    expect(response.body.data.map((lead) => lead.name)).toEqual(["S1 Lead"]);
  });

  // backend/README.md and .context/final-plan.md §7.1 document this as
  // intentional: out-of-scope leads return 404, not 403, so a user who can't
  // see a lead also can't tell whether it exists.
  it("sales_associate cannot GET another sales_associate's lead (404)", async () => {
    const created = await sales2Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S2 Lead" }));

    const response = await sales1Agent.get(`/api/v1/leads/${created.body.data._id}`);

    expect(response.status).toBe(404);
  });

  it("sales_associate cannot UPDATE another sales_associate's lead (404)", async () => {
    const created = await sales2Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S2 Lead" }));

    const response = await sales1Agent
      .patch(`/api/v1/leads/${created.body.data._id}`)
      .send({ notes: "hijacked" });

    expect(response.status).toBe(404);
  });

  it("sales_associate cannot DELETE another sales_associate's lead (404), and it stays intact", async () => {
    const created = await sales2Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "S2 Lead" }));

    const deleteResponse = await sales1Agent.delete(`/api/v1/leads/${created.body.data._id}`);
    expect(deleteResponse.status).toBe(404);

    const stillThere = await sales2Agent.get(`/api/v1/leads/${created.body.data._id}`);
    expect(stillThere.status).toBe(200);
  });

  it("forces ownerId to self when a sales_associate tries to create a lead for someone else", async () => {
    const response = await sales1Agent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ ownerId: String(sales2._id) }));

    expect(response.body.data.ownerId).toBe(String(sales1._id));
  });

  it("prevents a sales_associate from reassigning ownerId on update", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent
      .patch(`/api/v1/leads/${created.body.data._id}`)
      .send({ ownerId: String(sales2._id) });

    expect(response.body.data.ownerId).toBe(String(sales1._id));
  });

  it("allows a manager to create a lead assigned to a team member", async () => {
    const response = await managerAgent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ ownerId: String(sales2._id) }));

    expect(response.status).toBe(201);
    expect(response.body.data.ownerId).toBe(String(sales2._id));
  });

  it("returns 403 for a user with no leads permission granted", async () => {
    const response = await noPermAgent.get("/api/v1/leads");

    expect(response.status).toBe(403);
  });
});

describe("Convert to customer", () => {
  it("rejects a convert request with no projectManagerId", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    const response = await sales1Agent.post(`/api/v1/leads/${created.body.data._id}/convert`).send({});

    expect(response.status).toBe(400);
  });

  it("creates a real Customer from the lead's data and marks the lead converted", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());
    const leadId = created.body.data._id;

    await sales1Agent.patch(`/api/v1/leads/${leadId}/status`).send({ status: "won" });

    const response = await sales1Agent
      .post(`/api/v1/leads/${leadId}/convert`)
      .send({ projectManagerId: String(manager1._id) });

    expect(response.status).toBe(201);
    expect(response.body.data.companyName).toBe(buildLeadPayload().companyName);
    expect(response.body.data.email).toBe(buildLeadPayload().email);
    expect(response.body.data.projectManagerId).toBe(String(manager1._id));

    const leadAfter = await sales1Agent.get(`/api/v1/leads/${leadId}`);

    expect(leadAfter.body.data.convertedCustomerId).toBe(response.body.data._id);
  });

  it("carries over exactly the 5 solar fields from the lead, and no others", async () => {
    const created = await sales1Agent.post("/api/v1/leads").send(
      buildLeadPayload({
        clientType: "commercial",
        siteAddress: "42 Solar Way",
        roofType: "rcc",
        connectionType: "three_phase",
        estimatedCapacityKw: 25,
        monthlyElectricityBill: 20000,
        siteSurveyStatus: "completed",
      })
    );
    const leadId = created.body.data._id;
    await sales1Agent.patch(`/api/v1/leads/${leadId}/status`).send({ status: "won" });

    const response = await sales1Agent
      .post(`/api/v1/leads/${leadId}/convert`)
      .send({ projectManagerId: String(manager1._id) });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      clientType: "commercial",
      siteAddress: "42 Solar Way",
      roofType: "rcc",
      connectionType: "three_phase",
      estimatedCapacityKw: 25,
    });
    // Fields with no Lead-side equivalent, or that aren't part of the
    // documented carry-over set, must NOT be silently copied over.
    expect(response.body.data.installedCapacityKw).toBeNull();
    expect(response.body.data.netMeteringStatus).toBe("not_applied");
    expect(response.body.data.subsidyClaimStatus).toBe("not_applicable");
  });
});

describe("CSV import", () => {
  it("bulk-creates valid rows and reports skipped invalid rows without aborting the batch", async () => {
    const csv = [
      "Name,Email,Phone,Company,Source,Status,Budget",
      "Dave Import,dave@example.com,4444444444,Delta Inc,Referral,new,3000",
      "Eve Import,,5555555555,Epsilon LLC,Cold Call,contacted,7000",
      ",noemail@example.com,6666666666,Missing Name Co,Website,new,1000",
      "Frank Import,frank@example.com,7777777777,Foxtrot Co,BadStatus,not_a_real_status,2000",
    ].join("\n");

    const response = await sales1Agent
      .post("/api/v1/leads/import")
      .attach("file", Buffer.from(csv), "leads.csv");

    expect(response.status).toBe(201);
    expect(response.body.data.importedCount).toBe(2);
    expect(response.body.data.duplicateCount).toBe(0);
    expect(response.body.data.failedCount).toBe(2);
    expect(response.body.data.skippedCount).toBe(2);
    expect(response.body.data.skipped.map((row) => row.reason)).toEqual([
      "Missing name",
      "Invalid status: not_a_real_status",
    ]);
    expect(response.body.data.skipped.every((row) => row.type === "invalid")).toBe(true);

    const list = await sales1Agent.get("/api/v1/leads");
    expect(list.body.data.map((lead) => lead.name).sort()).toEqual(["Dave Import", "Eve Import"]);
  });

  it("rejects an import request with no file", async () => {
    const response = await sales1Agent.post("/api/v1/leads/import");

    expect(response.status).toBe(400);
  });

  it("skips rows duplicating an existing lead's email or phone (not company alone), and duplicates within the same file", async () => {
    const existing = await sales1Agent.post("/api/v1/leads").send(
      buildLeadPayload({ name: "Existing Lead", email: "existing@example.com", phone: "1111111111", companyName: "Existing Co" })
    );
    const existingLeadId = existing.body.data._id;

    const csv = [
      "Name,Email,Phone,Company,Source,Status,Budget",
      "Same Email,existing@example.com,2222222222,Brand New Co,Referral,new,1000",
      "Same Phone,brandnew@example.com,1111111111,Brand New Co 2,Referral,new,1000",
      "Same Company Different Contact,another@example.com,3333333333,Existing Co,Referral,new,1000",
      "Genuinely New,fresh@example.com,4444444444,Fresh Co,Referral,new,1000",
      "Repeats Row Above,fresh@example.com,5555555555,Another Co,Referral,new,1000",
    ].join("\n");

    const response = await sales1Agent
      .post("/api/v1/leads/import")
      .attach("file", Buffer.from(csv), "leads.csv");

    expect(response.status).toBe(201);
    // "Same Company Different Contact" is NOT skipped — company alone isn't
    // a duplicate signal, per this feature's explicit scope.
    expect(response.body.data.importedCount).toBe(2);
    expect(response.body.data.duplicateCount).toBe(3);
    expect(response.body.data.failedCount).toBe(0);
    expect(response.body.data.skippedCount).toBe(3);
    expect(response.body.data.skipped).toEqual([
      {
        row: 2,
        type: "duplicate",
        reason: `Duplicate: email "existing@example.com" matches existing lead "Existing Lead" (${existingLeadId})`,
        matchedField: "email",
        existingLeadId,
        existingLeadName: "Existing Lead",
      },
      {
        row: 3,
        type: "duplicate",
        reason: `Duplicate: phone "1111111111" matches existing lead "Existing Lead" (${existingLeadId})`,
        matchedField: "phone",
        existingLeadId,
        existingLeadName: "Existing Lead",
      },
      {
        row: 6,
        type: "duplicate",
        reason: 'Duplicate: email "fresh@example.com" matches row 5 earlier in this file',
        matchedField: "email",
      },
    ]);

    const list = await sales1Agent.get("/api/v1/leads");
    expect(list.body.data.map((lead) => lead.name).sort()).toEqual([
      "Existing Lead",
      "Genuinely New",
      "Same Company Different Contact",
    ]);
  });
});

describe("Excel export", () => {
  it("exports only the currently filtered set", async () => {
    await sales1Agent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ name: "Lost Lead", status: "lost", lostReason: "No budget" }));
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload({ name: "New Lead" }));

    const response = await sales1Agent
      .get("/api/v1/leads/export?status=lost")
      .buffer(true)
      .parse(bufferParser);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("spreadsheetml");

    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);

    const worksheet = workbook.worksheets[0];
    // header row + exactly 1 data row (the lost lead only)
    expect(worksheet.rowCount).toBe(2);
    // Column 1 is "Name" per the worksheet.columns order in lead.service.js#exportLeadsToExcel
    expect(worksheet.getRow(2).getCell(1).value).toBe("Lost Lead");
  });
});

describe("Lead sources", () => {
  it("lazily seeds the default list on first fetch", async () => {
    const response = await sales1Agent.get("/api/v1/lead-sources");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(10);
    expect(response.body.data.map((source) => source.name)).toContain("Website");
  });
});

describe("Assignment notifications (§6.7/§7.1, Phase 9)", () => {
  it("notifies the new owner when a lead is created assigned to someone else", async () => {
    const response = await managerAgent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ ownerId: sales1._id }));

    expect(response.status).toBe(201);

    const notification = await Notification.findOne({ userId: sales1._id, type: "lead_assigned" });
    expect(notification).not.toBeNull();
    expect(notification.message).toContain(response.body.data.name);
    expect(String(notification.relatedEntity.id)).toBe(String(response.body.data._id));
    expect(notification.relatedEntity.module).toBe("leads");
  });

  it("does not notify when a sales_associate creates their own lead", async () => {
    await sales1Agent.post("/api/v1/leads").send(buildLeadPayload());

    expect(await Notification.countDocuments({ userId: sales1._id, type: "lead_assigned" })).toBe(0);
  });

  it("notifies the new owner when a lead is reassigned via PATCH", async () => {
    const createResponse = await managerAgent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ ownerId: sales1._id }));
    const leadId = createResponse.body.data._id;

    const response = await managerAgent
      .patch(`/api/v1/leads/${leadId}`)
      .send({ ownerId: sales2._id });

    expect(response.status).toBe(200);

    const notification = await Notification.findOne({ userId: sales2._id, type: "lead_assigned" });
    expect(notification).not.toBeNull();
  });

  it("does not notify when an update leaves ownerId unchanged", async () => {
    const createResponse = await managerAgent
      .post("/api/v1/leads")
      .send(buildLeadPayload({ ownerId: sales1._id }));
    const leadId = createResponse.body.data._id;
    await Notification.deleteMany({});

    await managerAgent.patch(`/api/v1/leads/${leadId}`).send({ ownerId: sales1._id, notes: "unchanged owner" });

    expect(await Notification.countDocuments({ type: "lead_assigned" })).toBe(0);
  });

  it("resets both follow-up reminder SentAt fields when followUpDate changes", async () => {
    const createResponse = await sales1Agent.post("/api/v1/leads").send(
      buildLeadPayload({ followUpDate: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    );
    const leadId = createResponse.body.data._id;

    await Lead.findByIdAndUpdate(leadId, {
      followUpReminder24hSentAt: new Date(),
      followUpReminder15mSentAt: new Date(),
    });

    await sales1Agent
      .patch(`/api/v1/leads/${leadId}`)
      .send({ followUpDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() });

    const updatedLead = await Lead.findById(leadId);
    expect(updatedLead.followUpReminder24hSentAt).toBeNull();
    expect(updatedLead.followUpReminder15mSentAt).toBeNull();
  });

  it("leaves the reminder SentAt fields untouched when followUpDate is not part of the update", async () => {
    const createResponse = await sales1Agent.post("/api/v1/leads").send(
      buildLeadPayload({ followUpDate: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    );
    const leadId = createResponse.body.data._id;
    const sentAt = new Date();

    await Lead.findByIdAndUpdate(leadId, {
      followUpReminder24hSentAt: sentAt,
      followUpReminder15mSentAt: sentAt,
    });

    await sales1Agent.patch(`/api/v1/leads/${leadId}`).send({ notes: "no date change here" });

    const updatedLead = await Lead.findById(leadId);
    expect(updatedLead.followUpReminder24hSentAt).not.toBeNull();
    expect(updatedLead.followUpReminder15mSentAt).not.toBeNull();
  });
});
