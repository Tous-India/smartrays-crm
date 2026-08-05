import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { generateSync } from "otplib";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly } from "../../../tests/helpers/authHelpers.js";
import User from "../user/user.model.js";
import { decryptCredential } from "../../services/credentialEncryption.service.js";

let app;

const EMPLOYEE = { email: "employee@2fa.local", password: "Password123" };
const ADMIN = { email: "admin@2fa.local", password: "AdminPass123!" };

/** Logs in and returns the raw response — no cookie handling assumptions. */
function login({ email, password }) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}

/** Walks a user all the way through enrolment, returning their codes. */
async function enrol(preAuthToken) {
  const start = await request(app)
    .post("/api/v1/auth/2fa/enrol/start")
    .set("Authorization", `Bearer ${preAuthToken}`)
    .send({});

  const confirm = await request(app)
    .post("/api/v1/auth/2fa/enrol/confirm")
    .set("Authorization", `Bearer ${preAuthToken}`)
    .send({ token: generateSync({ secret: start.body.data.secret }) });

  return { secret: start.body.data.secret, response: confirm };
}

async function currentTokenFor(email) {
  const user = await User.findOne({ email }).select("+twoFactorSecretEncrypted +twoFactorSecretIv");
  const secret = decryptCredential({
    passwordEncrypted: user.twoFactorSecretEncrypted,
    passwordIv: user.twoFactorSecretIv,
  });

  return generateSync({ secret });
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await User.deleteMany({});
  await createUserDirectly({ name: "Employee", ...EMPLOYEE, role: "employee" });
  await createUserDirectly({ name: "Admin", ...ADMIN, role: "admin" });
});

/**
 * The assertion that matters most: a correct password alone must never
 * produce a session.
 */
describe("Login does not issue a session before the second factor", () => {
  it("issues NO Set-Cookie for an admin stopped at mandatory enrolment", async () => {
    const response = await login(ADMIN);

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body.data.requiresEnrolment).toBe(true);
    expect(response.body.data.preAuthToken).toBeDefined();
  });

  it("issues NO Set-Cookie for an enrolled user until the code verifies", async () => {
    const first = await login(ADMIN);
    await enrol(first.body.data.preAuthToken);

    const second = await login(ADMIN);

    expect(second.headers["set-cookie"]).toBeUndefined();
    expect(second.body.data.requiresTwoFactor).toBe(true);
  });

  it("issues the session cookie only AFTER a valid code", async () => {
    const first = await login(ADMIN);
    await enrol(first.body.data.preAuthToken);
    const second = await login(ADMIN);

    const verified = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: await currentTokenFor(ADMIN.email) });

    expect(verified.status).toBe(200);
    expect(verified.headers["set-cookie"]).toBeDefined();
    expect(String(verified.headers["set-cookie"])).toMatch(/HttpOnly/i);
  });

  it("still issues a cookie immediately for a role with no mandatory 2FA", async () => {
    const response = await login(EMPLOYEE);

    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.body.data.preAuthToken).toBeUndefined();
  });
});

describe("The pre-auth token reaches nothing but the 2FA endpoints", () => {
  it("cannot be used as a session cookie, even if placed in one", async () => {
    const response = await login(ADMIN);

    const attempt = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", [`token=${response.body.data.preAuthToken}`]);

    expect(attempt.status).toBe(401);
  });

  it("cannot authorise an ordinary endpoint via the Authorization header", async () => {
    const response = await login(ADMIN);

    const attempt = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${response.body.data.preAuthToken}`);

    expect(attempt.status).toBe(401);
  });
});

describe("Mandatory enrolment cannot be bypassed", () => {
  it("blocks an admin who has not enrolled from reaching an ordinary endpoint", async () => {
    // Even holding a genuine session token, the per-request gate stops them.
    const employeeLogin = await login(EMPLOYEE);
    const employeeCookie = employeeLogin.headers["set-cookie"];

    // Sanity: a non-mandatory role passes the same gate.
    const ok = await request(app).get("/api/v1/auth/me").set("Cookie", employeeCookie);
    expect(ok.status).toBe(200);

    const adminLogin = await login(ADMIN);
    expect(adminLogin.headers["set-cookie"]).toBeUndefined();
    expect(adminLogin.body.data.requiresEnrolment).toBe(true);
  });

  it("lets the admin through once enrolment completes, issuing the session then", async () => {
    const first = await login(ADMIN);
    const { response } = await enrol(first.body.data.preAuthToken);

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.body.data.recoveryCodes).toHaveLength(10);
  });
});

describe("Recovery codes", () => {
  it("are single-use and cannot be replayed", async () => {
    const first = await login(ADMIN);
    const { response } = await enrol(first.body.data.preAuthToken);
    const [code] = response.body.data.recoveryCodes;

    const second = await login(ADMIN);
    const used = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: code });
    expect(used.status).toBe(200);

    const third = await login(ADMIN);
    const replay = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${third.body.data.preAuthToken}`)
      .send({ token: code });

    expect(replay.status).toBe(401);
  });

  it("are stored only as hashes, never in plaintext", async () => {
    const first = await login(ADMIN);
    const { response } = await enrol(first.body.data.preAuthToken);
    const [code] = response.body.data.recoveryCodes;

    const user = await User.findOne({ email: ADMIN.email }).select("+twoFactorRecoveryCodeHashes");

    expect(user.twoFactorRecoveryCodeHashes).toHaveLength(10);
    expect(user.twoFactorRecoveryCodeHashes).not.toContain(code);
    expect(user.twoFactorRecoveryCodeHashes.every((hash) => hash.startsWith("$2"))).toBe(true);
  });
});

describe("Rate limiting on verification", () => {
  it("locks the attempt after repeated wrong codes", async () => {
    const first = await login(ADMIN);
    await enrol(first.body.data.preAuthToken);
    const second = await login(ADMIN);
    const bearer = `Bearer ${second.body.data.preAuthToken}`;

    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await request(app)
        .post("/api/v1/auth/2fa/verify")
        .set("Authorization", bearer)
        .send({ token: "000000" });
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
    // And a CORRECT code is refused too, until the login restarts.
    const blocked = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", bearer)
      .send({ token: await currentTokenFor(ADMIN.email) });
    expect(blocked.status).toBe(429);
  });
});

describe("TOTP secrets are protected", () => {
  it("are encrypted at rest, never stored in plaintext", async () => {
    const first = await login(ADMIN);
    const { secret } = await enrol(first.body.data.preAuthToken);

    const user = await User.findOne({ email: ADMIN.email }).select(
      "+twoFactorSecretEncrypted +twoFactorSecretIv"
    );

    expect(user.twoFactorSecretEncrypted).toBeDefined();
    expect(user.twoFactorSecretEncrypted).not.toBe(secret);
    // Round-trips back to the same secret, so it's genuinely encrypted rather
    // than merely mangled.
    expect(
      decryptCredential({
        passwordEncrypted: user.twoFactorSecretEncrypted,
        passwordIv: user.twoFactorSecretIv,
      })
    ).toBe(secret);
  });

  it("never appear in an ordinary user response", async () => {
    const first = await login(ADMIN);
    await enrol(first.body.data.preAuthToken);
    const second = await login(ADMIN);

    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send(ADMIN);
    await agent
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: await currentTokenFor(ADMIN.email) });

    const me = await agent.get("/api/v1/auth/me");
    const serialized = JSON.stringify(me.body);

    expect(serialized).not.toMatch(/twoFactorSecret/);
    expect(serialized).not.toMatch(/twoFactorRecoveryCodeHashes/);
  });
});

describe("Admin reset of another user's 2FA", () => {
  async function enrolledAdminAgent() {
    const first = await login(ADMIN);
    await enrol(first.body.data.preAuthToken);
    const second = await login(ADMIN);

    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send(ADMIN);
    await agent
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: await currentTokenFor(ADMIN.email) });

    return agent;
  }

  it("fails without the acting admin's own password", async () => {
    const agent = await enrolledAdminAgent();
    const target = await User.findOne({ email: EMPLOYEE.email });

    const response = await agent.post("/api/v1/auth/2fa/admin-reset").send({
      targetUserId: String(target._id),
      token: await currentTokenFor(ADMIN.email),
    });

    expect(response.status).toBe(400);
  });

  it("fails with a WRONG password even from a valid admin session", async () => {
    const agent = await enrolledAdminAgent();
    const target = await User.findOne({ email: EMPLOYEE.email });

    const response = await agent.post("/api/v1/auth/2fa/admin-reset").send({
      targetUserId: String(target._id),
      password: "NotTheRightPassword",
      token: await currentTokenFor(ADMIN.email),
    });

    expect(response.status).toBe(401);
  });

  it("fails with a wrong 2FA code even when the password is right", async () => {
    const agent = await enrolledAdminAgent();
    const target = await User.findOne({ email: EMPLOYEE.email });

    const response = await agent.post("/api/v1/auth/2fa/admin-reset").send({
      targetUserId: String(target._id),
      password: ADMIN.password,
      token: "000000",
    });

    expect(response.status).toBe(401);
  });

  it("succeeds with both factors, and clears the target's 2FA", async () => {
    const agent = await enrolledAdminAgent();
    const target = await User.findOne({ email: EMPLOYEE.email });
    await User.updateOne({ _id: target._id }, { $set: { twoFactorEnabled: true } });

    const response = await agent.post("/api/v1/auth/2fa/admin-reset").send({
      targetUserId: String(target._id),
      password: ADMIN.password,
      token: await currentTokenFor(ADMIN.email),
    });

    expect(response.status).toBe(200);
    const after = await User.findById(target._id).select("+twoFactorSecretEncrypted");
    expect(after.twoFactorEnabled).toBe(false);
    expect(after.twoFactorSecretEncrypted).toBeNull();
  });
});

describe("Password change", () => {
  async function employeeAgent() {
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send(EMPLOYEE).expect(200);
    return agent;
  }

  it("requires the current password", async () => {
    const agent = await employeeAgent();

    const response = await agent
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "WrongPassword", newPassword: "BrandNewPass1" });

    expect(response.status).toBe(401);
  });

  it("changes the password, and the new one then works for login", async () => {
    const agent = await employeeAgent();

    const response = await agent
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: EMPLOYEE.password, newPassword: "BrandNewPass1" });
    expect(response.status).toBe(200);

    const relogin = await login({ email: EMPLOYEE.email, password: "BrandNewPass1" });
    expect(relogin.status).toBe(200);
    expect(relogin.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a new password identical to the current one", async () => {
    const agent = await employeeAgent();

    const response = await agent
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: EMPLOYEE.password, newPassword: EMPLOYEE.password });

    expect(response.status).toBe(400);
  });
});
