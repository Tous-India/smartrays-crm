import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import Customer from "../customer/customer.model.js";
import Contact from "../customer/contact.model.js";
import User from "../user/user.model.js";

// No test here ever sends a real email — mocked at the module boundary, same
// pattern as Cloudinary/Google Maps/web-push mocking elsewhere in this
// codebase. Captured so forgot-password tests can assert the reset link's
// shape without a real SMTP connection.
const sendPasswordResetEmailMock = vi.fn(async () => {});
vi.mock("../../services/email.service.js", () => ({
  sendPasswordResetEmail: (...args) => sendPasswordResetEmailMock(...args),
}));

let app;
let admin;

const ADMIN_EMAIL = "admin@test.local";
const ADMIN_PASSWORD = "AdminPass123!";

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

// Each auth test starts from a completely clean database with one bootstrap
// admin — the flows under test (register/login/logout) all mutate users, so
// isolating per-test avoids one test's account state leaking into another.
beforeEach(async () => {
  await clearAllCollections();
  sendPasswordResetEmailMock.mockClear();
  admin = await createUserDirectly({
    name: "Admin",
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: "admin",
  });
});

describe("POST /auth/register", () => {
  it("is rejected when not authenticated", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      name: "New Employee",
      email: "employee@test.local",
      password: "Password123",
      role: "employee",
    });

    expect(response.status).toBe(401);
  });

  it("is rejected when authenticated as a non-admin", async () => {
    await createUserDirectly({
      name: "Employee",
      email: "employee@test.local",
      password: "Password123",
      role: "employee",
    });
    const employeeAgent = await loginAsAgent(app, "employee@test.local", "Password123");

    const response = await employeeAgent.post("/api/v1/auth/register").send({
      name: "Another Employee",
      email: "another@test.local",
      password: "Password123",
      role: "employee",
    });

    expect(response.status).toBe(403);
  });

  it("succeeds when authenticated as admin and never returns the password hash", async () => {
    const adminAgent = await loginAsAgent(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "New Employee",
      email: "employee@test.local",
      password: "Password123",
      role: "employee",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe("employee@test.local");
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it("is rejected for a duplicate email", async () => {
    const adminAgent = await loginAsAgent(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "Duplicate Admin",
      email: ADMIN_EMAIL,
      password: "Password123",
      role: "employee",
    });

    expect(response.status).toBe(409);
  });

  it("is rejected when the password is too short", async () => {
    const adminAgent = await loginAsAgent(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "Short Password",
      email: "short@test.local",
      password: "short",
      role: "employee",
    });

    expect(response.status).toBe(400);
  });

  it("is rejected for an invalid role", async () => {
    const adminAgent = await loginAsAgent(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await adminAgent.post("/api/v1/auth/register").send({
      name: "Bad Role",
      email: "badrole@test.local",
      password: "Password123",
      role: "executive",
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /auth/customer/signup", () => {
  it("succeeds when the signup email's domain matches an existing Contact's email, and never returns the password hash", async () => {
    const customer = await Customer.create({
      companyName: "Acme Corp",
      ownerId: admin._id,
      projectManagerId: admin._id,
    });
    await Contact.create({ customerId: customer._id, name: "Acme Employee", email: "someone@acme.com" });

    const response = await request(app).post("/api/v1/auth/customer/signup").send({
      name: "New Portal User",
      email: "newuser@acme.com",
      password: "Password123",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe("newuser@acme.com");
    expect(response.body.data.role).toBe("customer");
    expect(response.body.data.customerId).toBe(String(customer._id));
    expect(response.body.data.passwordHash).toBeUndefined();
    expect(response.body.data.permissions).toEqual({ tickets: { create: true, view_own: true } });
  });

  it("falls back to matching Customer.email's domain when no Contact matches", async () => {
    const customer = await Customer.create({
      companyName: "Beta Co",
      ownerId: admin._id,
      projectManagerId: admin._id,
      email: "info@betaco.com",
    });

    const response = await request(app).post("/api/v1/auth/customer/signup").send({
      name: "Beta Portal User",
      email: "newuser@betaco.com",
      password: "Password123",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.customerId).toBe(String(customer._id));
  });

  it("is rejected with a clear message when no Customer/Contact domain matches", async () => {
    const response = await request(app).post("/api/v1/auth/customer/signup").send({
      name: "Nobody",
      email: "nobody@unknown-domain.com",
      password: "Password123",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/no matching company/i);
  });

  it("is rejected for a duplicate email", async () => {
    const customer = await Customer.create({
      companyName: "Acme Corp",
      ownerId: admin._id,
      projectManagerId: admin._id,
    });
    await Contact.create({ customerId: customer._id, name: "Acme Employee", email: "someone@acme.com" });

    await request(app).post("/api/v1/auth/customer/signup").send({
      name: "New Portal User",
      email: "newuser@acme.com",
      password: "Password123",
    });

    const response = await request(app).post("/api/v1/auth/customer/signup").send({
      name: "Duplicate",
      email: "newuser@acme.com",
      password: "Password123",
    });

    expect(response.status).toBe(409);
  });

  it("is rejected for an invalid email or a too-short password", async () => {
    const badEmail = await request(app).post("/api/v1/auth/customer/signup").send({
      name: "Bad Email",
      email: "not-an-email",
      password: "Password123",
    });
    expect(badEmail.status).toBe(400);

    const shortPassword = await request(app).post("/api/v1/auth/customer/signup").send({
      name: "Short Password",
      email: "someone@acme.com",
      password: "short",
    });
    expect(shortPassword.status).toBe(400);
  });

  it("lets the newly signed-up account log in like any other", async () => {
    const customer = await Customer.create({
      companyName: "Acme Corp",
      ownerId: admin._id,
      projectManagerId: admin._id,
    });
    await Contact.create({ customerId: customer._id, name: "Acme Employee", email: "someone@acme.com" });

    await request(app).post("/api/v1/auth/customer/signup").send({
      name: "New Portal User",
      email: "newuser@acme.com",
      password: "Password123",
    });

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "newuser@acme.com", password: "Password123" });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.data.role).toBe("customer");
  });
});

describe("POST /auth/login", () => {
  it("succeeds with correct credentials and sets a session cookie", async () => {
    // Uses a role with NO mandatory 2FA. Admin/manager are stopped at the
    // enrolment gate and deliberately receive no cookie (§7.38) — covered by
    // its own test below and by twoFactor.test.js.
    await createUserDirectly({
      name: "Plain Employee",
      email: "employee.plain@test.local",
      password: "Password123",
      role: "employee",
    });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "employee.plain@test.local", password: "Password123" });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.body.data.email).toBe("employee.plain@test.local");
    expect(response.body.data.passwordHash).toBeUndefined();
    // The token must never appear in the response body, only in the cookie.
    expect(JSON.stringify(response.body)).not.toMatch(/eyJhbGciOi/);
  });

  it("does NOT set a session cookie for an admin who has not enrolled in mandatory 2FA", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body.data.requiresEnrolment).toBe(true);
    expect(response.body.data.preAuthToken).toBeDefined();
  });

  it("fails with the wrong password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ADMIN_EMAIL, password: "WrongPassword" });

    expect(response.status).toBe(401);
  });

  it("fails for a nonexistent email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.local", password: "WrongPassword" });

    expect(response.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("fails without a session", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
  });

  it("returns the current user with a valid session", async () => {
    const adminAgent = await loginAsAgent(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await adminAgent.get("/api/v1/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(ADMIN_EMAIL);
  });
});

describe("POST /auth/logout", () => {
  it("clears the session so a subsequent /auth/me fails", async () => {
    const adminAgent = await loginAsAgent(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const meBeforeLogout = await adminAgent.get("/api/v1/auth/me");
    expect(meBeforeLogout.status).toBe(200);

    const logoutResponse = await adminAgent.post("/api/v1/auth/logout");
    expect(logoutResponse.status).toBe(200);

    const meAfterLogout = await adminAgent.get("/api/v1/auth/me");
    expect(meAfterLogout.status).toBe(401);
  });

  // Regression test for a bug found during manual verification: passing
  // maxAge into res.clearCookie() made Express recompute Expires into the
  // future instead of clearing the cookie immediately, so the browser would
  // keep an (unusable, but lingering) cookie around for a week instead of
  // dropping it right away. Locks in the fix in auth.service.js's
  // getAuthCookieOptions()/getAuthCookieMaxAgeMs() split.
  it("sends a Set-Cookie header that expires immediately, not in the future", async () => {
    const adminAgent = await loginAsAgent(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const logoutResponse = await adminAgent.post("/api/v1/auth/logout");
    const setCookieHeader = logoutResponse.headers["set-cookie"][0];

    expect(setCookieHeader).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookieHeader).not.toMatch(/Max-Age/i);
  });
});

describe("POST /auth/forgot-password", () => {
  it("returns the same generic response for a matching account and sends the reset email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: ADMIN_EMAIL });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an account with that email exists/i);
    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmailMock.mock.calls[0][0].to).toBe(ADMIN_EMAIL);
    expect(sendPasswordResetEmailMock.mock.calls[0][0].resetUrl).toMatch(/\/reset-password\?token=/);
  });

  it("returns the exact same generic response for a non-existent account, and sends no email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@test.local" });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an account with that email exists/i);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("sends no email for a deactivated account either, without leaking that distinction", async () => {
    const deactivated = await createUserDirectly({
      name: "Deactivated",
      email: "deactivated@test.local",
      password: "Password123",
      role: "employee",
    });
    deactivated.isActive = false;
    await deactivated.save();

    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "deactivated@test.local" });

    expect(response.status).toBe(200);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("is rejected for an invalid email", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(400);
  });
});

describe("POST /auth/reset-password", () => {
  async function requestResetToken(email) {
    await request(app).post("/api/v1/auth/forgot-password").send({ email });
    return sendPasswordResetEmailMock.mock.calls.at(-1)[0].resetUrl.split("token=")[1];
  }

  it("resets the password with a valid token and lets the user log in with the new password", async () => {
    const token = await requestResetToken(ADMIN_EMAIL);

    const resetResponse = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: "NewPassword123" });

    expect(resetResponse.status).toBe(200);

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ADMIN_EMAIL, password: "NewPassword123" });

    expect(loginResponse.status).toBe(200);

    const oldPasswordLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(oldPasswordLogin.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "not-a-real-token", newPassword: "NewPassword123" });

    expect(response.status).toBe(400);
  });

  it("rejects a token that has already been used once", async () => {
    const token = await requestResetToken(ADMIN_EMAIL);

    await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "NewPassword123" });

    const secondAttempt = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: "AnotherPassword123" });

    expect(secondAttempt.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const token = await requestResetToken(ADMIN_EMAIL);

    const user = await User.findOne({ email: ADMIN_EMAIL }).select("+passwordResetExpiresAt");
    user.passwordResetExpiresAt = new Date(Date.now() - 1000);
    await user.save();

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: "NewPassword123" });

    expect(response.status).toBe(400);
  });

  it("is rejected when the new password is too short", async () => {
    const token = await requestResetToken(ADMIN_EMAIL);

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: "short" });

    expect(response.status).toBe(400);
  });
});
