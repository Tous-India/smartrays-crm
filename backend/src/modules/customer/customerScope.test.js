import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { loginAsAgent, createUserDirectly } from "../../../tests/helpers/authHelpers.js";

// 2026-10-23 (owner's decision): a manager also sees the customers where
// their team (or they themselves) is the PROJECT MANAGER, not only where they
// own the account. Before this, the installation manager — whose team are the
// project managers — saw no customers at all.
let app, Customer, User;
let installManagerAgent, salesManagerAgent, employeeAgent;
let salesManager, installManager, salesRep, engineer, otherManager;
let managedSite, ownedBySales, unrelated;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
  ({ default: Customer } = await import("./customer.model.js"));
  ({ default: User } = await import("../user/user.model.js"));

  await createUserDirectly({ name: "Admin", email: "admin@test.local", password: "AdminPass123!", role: "admin" });
  const adminAgent = await loginAsAgent(app, "admin@test.local", "AdminPass123!");
  const register = async (payload) => (await adminAgent.post("/api/v1/auth/register").send({ password: "Password123", ...payload }).expect(201)).body.data;

  salesManager = await register({ name: "Sales Manager", email: "sales.mgr@test.local", role: "manager" });
  installManager = await register({ name: "Install Manager", email: "install.mgr@test.local", role: "manager" });
  otherManager = await register({ name: "Other Manager", email: "other.mgr@test.local", role: "manager" });
  salesRep = await register({ name: "Sales Rep", email: "rep@test.local", role: "employee" });
  engineer = await register({ name: "Engineer", email: "engineer@test.local", role: "employee" });
  await User.updateOne({ _id: salesRep._id }, { $set: { managerId: salesManager._id } });
  await User.updateOne({ _id: engineer._id }, { $set: { managerId: installManager._id } });

  managedSite = await Customer.create({ companyName: "Managed Site", ownerId: salesRep._id, projectManagerId: engineer._id });
  ownedBySales = await Customer.create({ companyName: "Sales Owned", ownerId: salesRep._id, projectManagerId: otherManager._id });
  unrelated = await Customer.create({ companyName: "Unrelated", ownerId: otherManager._id, projectManagerId: otherManager._id });

  installManagerAgent = await loginAsAgent(app, "install.mgr@test.local", "Password123");
  salesManagerAgent = await loginAsAgent(app, "sales.mgr@test.local", "Password123");
  employeeAgent = await loginAsAgent(app, "engineer@test.local", "Password123");
});

afterAll(async () => {
  await stopTestDatabase();
});

const names = (response) => response.body.data.map((customer) => customer.companyName).sort();

describe("Customer visibility for managers", () => {
  it("shows the installation manager the customers their team project-manages", async () => {
    const response = await installManagerAgent.get("/api/v1/customers").expect(200);
    expect(names(response)).toEqual(["Managed Site"]);

    await installManagerAgent.get(`/api/v1/customers/${managedSite._id}`).expect(200);
    await installManagerAgent.get(`/api/v1/customers/${unrelated._id}`).expect(404);
  });

  it("still shows the sales manager the customers their team owns", async () => {
    const response = await salesManagerAgent.get("/api/v1/customers").expect(200);
    expect(names(response)).toEqual(["Managed Site", "Sales Owned"]);
  });

  it("leaves employees as they were (no customers.view by default)", async () => {
    await employeeAgent.get("/api/v1/customers").expect(403);
  });
});
