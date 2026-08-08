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

/**
 * Walks a user all the way through enrolment, returning their codes.
 *
 * Takes a SESSION cookie, not a pre-auth token: since 2026-08-08 enrolment is
 * a purely post-authentication action. The mandatory gate that used to let an
 * admin/manager enrol while holding only a pre-auth token is gone, and with it
 * the reason for `/2fa/enrol/*` to accept one.
 */
async function enrol(session) {
  const start = await request(app).post("/api/v1/auth/2fa/enrol/start").set("Cookie", session).send({});

  const confirm = await request(app)
    .post("/api/v1/auth/2fa/enrol/confirm")
    .set("Cookie", session)
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
  // The "admin stopped at mandatory enrolment" case that used to open this
  // block is gone with the mandate (2026-08-08). Its replacement — an
  // un-enrolled admin now signing straight in — lives in "2FA is opt-in for
  // every role" below, where it belongs.

  it("issues NO Set-Cookie for an enrolled user until the code verifies", async () => {
    const first = await login(ADMIN);
    await enrol(first.headers["set-cookie"]);

    const second = await login(ADMIN);

    expect(second.headers["set-cookie"]).toBeUndefined();
    expect(second.body.data.requiresTwoFactor).toBe(true);
  });

  it("issues the session cookie only AFTER a valid code", async () => {
    const first = await login(ADMIN);
    await enrol(first.headers["set-cookie"]);
    const second = await login(ADMIN);

    const verified = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: await currentTokenFor(ADMIN.email) });

    expect(verified.status).toBe(200);
    expect(verified.headers["set-cookie"]).toBeDefined();
    expect(String(verified.headers["set-cookie"])).toMatch(/HttpOnly/i);
  });

  it("still issues a cookie immediately for a user who has not enabled 2FA", async () => {
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

describe("Voluntary enrolment", () => {
  it("enrols from a session and returns ten recovery codes", async () => {
    // Was "Mandatory enrolment cannot be bypassed" until 2026-08-08, when the
    // admin/manager mandate was removed and 2FA became opt-in for every role.
    // Enrolment itself is unchanged; only who is FORCED into it changed. See
    // "2FA is opt-in for every role" below for the gate-removal assertions.
    const first = await login(ADMIN);
    const { response } = await enrol(first.headers["set-cookie"]);

    expect(response.status).toBe(200);
    expect(response.body.data.recoveryCodes).toHaveLength(10);
  });
});

describe("Recovery codes", () => {
  it("are single-use and cannot be replayed", async () => {
    const first = await login(ADMIN);
    const { response } = await enrol(first.headers["set-cookie"]);
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
    const { response } = await enrol(first.headers["set-cookie"]);
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
    await enrol(first.headers["set-cookie"]);
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
    const { secret } = await enrol(first.headers["set-cookie"]);

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
    await enrol(first.headers["set-cookie"]);
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
    await enrol(first.headers["set-cookie"]);
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

/**
 * Self-service 2FA enable/disable (2026-08-08).
 *
 * 2FA is now opt-in for EVERY role — the mandatory-enrolment gate for
 * admin/manager is gone. The load-bearing part is disable: a session alone must
 * never be enough, or a stolen session can switch off the control that exists
 * to defeat a stolen session.
 */
describe("Self-service 2FA — disable requires re-authentication", () => {
  /** Enrols ADMIN and returns their session cookie, secret and recovery codes. */
  async function enrolledAdminSession() {
    const first = await login(ADMIN);
    const { secret, response } = await enrol(first.headers["set-cookie"]);
    const recoveryCodes = response.body.data.recoveryCodes;

    const second = await login(ADMIN);
    const verified = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: generateSync({ secret }) });

    return { secret, recoveryCodes, session: verified.headers["set-cookie"] };
  }

  it("REJECTS a disable with a valid session and a valid code but NO password", async () => {
    const { secret, session } = await enrolledAdminSession();

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ token: generateSync({ secret }) });

    expect(response.status).toBe(400);

    const user = await User.findOne({ email: ADMIN.email });
    expect(user.twoFactorEnabled).toBe(true);
  });

  it("REJECTS a disable with the WRONG password", async () => {
    const { secret, session } = await enrolledAdminSession();

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: "NotThePassword123!", token: generateSync({ secret }) });

    expect(response.status).toBe(401);

    const user = await User.findOne({ email: ADMIN.email });
    expect(user.twoFactorEnabled).toBe(true);
  });

  it("REJECTS a disable with the right password but NO second factor", async () => {
    const { session } = await enrolledAdminSession();

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: ADMIN.password });

    expect(response.status).toBe(400);

    const user = await User.findOne({ email: ADMIN.email });
    expect(user.twoFactorEnabled).toBe(true);
  });

  it("REJECTS a disable with the right password but an INVALID code", async () => {
    const { session } = await enrolledAdminSession();

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: ADMIN.password, token: "000000" });

    expect(response.status).toBe(401);

    const user = await User.findOne({ email: ADMIN.email });
    expect(user.twoFactorEnabled).toBe(true);
  });

  it("A VALID SESSION ALONE cannot disable 2FA — the whole point of the endpoint", async () => {
    const { session } = await enrolledAdminSession();

    // Exactly what a stolen session can produce on its own: a legitimate
    // cookie and nothing else.
    const response = await request(app).post("/api/v1/auth/2fa/disable").set("Cookie", session).send({});

    expect(response.status).toBe(400);

    const user = await User.findOne({ email: ADMIN.email }).select("+twoFactorSecretEncrypted");
    expect(user.twoFactorEnabled).toBe(true);
    expect(user.twoFactorSecretEncrypted).toBeTruthy();
  });

  it("ACCEPTS password + TOTP, clearing the secret and every recovery code", async () => {
    const { secret, session } = await enrolledAdminSession();

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: ADMIN.password, token: generateSync({ secret }) });

    expect(response.status).toBe(200);

    const user = await User.findOne({ email: ADMIN.email }).select(
      "+twoFactorSecretEncrypted +twoFactorSecretIv +twoFactorRecoveryCodeHashes"
    );
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecretEncrypted).toBeNull();
    expect(user.twoFactorSecretIv).toBeNull();
    expect(user.twoFactorRecoveryCodeHashes).toHaveLength(0);
  });

  it("ACCEPTS password + a RECOVERY CODE, for someone who lost their authenticator", async () => {
    const { recoveryCodes, session } = await enrolledAdminSession();

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: ADMIN.password, token: recoveryCodes[0] });

    expect(response.status).toBe(200);

    const user = await User.findOne({ email: ADMIN.email });
    expect(user.twoFactorEnabled).toBe(false);
  });

  it("REVOKES EVERY TRUSTED DEVICE — a token minted under 2FA must not outlive it", async () => {
    const first = await login(ADMIN);
    const { secret } = await enrol(first.headers["set-cookie"]);

    const second = await login(ADMIN);
    const verified = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: generateSync({ secret }), rememberDevice: true });

    const session = verified.headers["set-cookie"];

    // The device cookie really was minted — otherwise the assertion below
    // would pass against an empty list for the wrong reason.
    const withDevice = await User.findOne({ email: ADMIN.email }).select("+trustedDevices");
    expect(withDevice.trustedDevices.length).toBe(1);

    await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: ADMIN.password, token: await currentTokenFor(ADMIN.email) })
      .expect(200);

    const after = await User.findOne({ email: ADMIN.email }).select("+trustedDevices");
    expect(after.trustedDevices).toHaveLength(0);
  });

  it("cannot disable ANOTHER user's 2FA through this endpoint", async () => {
    // The employee enrols voluntarily, then the admin tries to turn it off
    // using their own credentials plus a targetUserId.
    const employeeFirst = await login(EMPLOYEE);
    const employeeSession = employeeFirst.headers["set-cookie"];
    const start = await request(app).post("/api/v1/auth/2fa/enrol/start").set("Cookie", employeeSession).send({});
    await request(app)
      .post("/api/v1/auth/2fa/enrol/confirm")
      .set("Cookie", employeeSession)
      .send({ token: generateSync({ secret: start.body.data.secret }) });

    const { secret: adminSecret, session: adminSession } = await enrolledAdminSession();
    const employee = await User.findOne({ email: EMPLOYEE.email });

    await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", adminSession)
      .send({
        password: ADMIN.password,
        token: generateSync({ secret: adminSecret }),
        targetUserId: String(employee._id),
        userId: String(employee._id),
      });

    // Whatever the status, the employee's 2FA must be untouched — the endpoint
    // is self-scoped and ignores any caller-supplied identity.
    const untouched = await User.findOne({ email: EMPLOYEE.email });
    expect(untouched.twoFactorEnabled).toBe(true);
  });

  it("rejects an unauthenticated disable outright", async () => {
    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .send({ password: ADMIN.password, token: "123456" });

    expect(response.status).toBe(401);
  });

  it("refuses when 2FA is not enabled — there is nothing to disable", async () => {
    const employeeLogin = await login(EMPLOYEE);

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", employeeLogin.headers["set-cookie"])
      .send({ password: EMPLOYEE.password, token: "123456" });

    expect(response.status).toBe(400);
  });
});

describe("2FA is opt-in for every role — the mandatory gate is gone", () => {
  it("logs an ADMIN straight in with a real session cookie and no second factor", async () => {
    const response = await login(ADMIN);

    expect(response.status).toBe(200);
    // The real assertion is the cookie: before this change an admin without
    // 2FA got NO Set-Cookie at all, only a pre-auth token.
    const cookies = response.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.join(";")).toMatch(/token=/);
    expect(response.body.data.preAuthToken).toBeUndefined();
    expect(response.body.data.requiresEnrolment).toBeUndefined();
  });

  it("lets an un-enrolled ADMIN reach an ordinary endpoint, not just the 2FA ones", async () => {
    const response = await login(ADMIN);

    const users = await request(app).get("/api/v1/users").set("Cookie", response.headers["set-cookie"]);

    // The old per-request gate returned 403 TWO_FACTOR_ENROLMENT_REQUIRED here.
    expect(users.status).toBe(200);
  });

  it("lets an un-enrolled MANAGER in the same way", async () => {
    await createUserDirectly({
      name: "Manager",
      email: "manager@2fa.local",
      password: "ManagerPass123!",
      role: "manager",
    });

    const response = await login({ email: "manager@2fa.local", password: "ManagerPass123!" });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(response.body.data.preAuthToken).toBeUndefined();
  });

  it("leaves an ALREADY-ENROLLED admin fully protected — removing the mandate disables nothing", async () => {
    const first = await login(ADMIN);
    await enrol(first.headers["set-cookie"]);

    const again = await login(ADMIN);

    // Still no session until the second factor is produced.
    expect(again.headers["set-cookie"]).toBeUndefined();
    expect(again.body.data.requiresTwoFactor).toBe(true);
    expect(again.body.data.preAuthToken).toBeDefined();

    const user = await User.findOne({ email: ADMIN.email });
    expect(user.twoFactorEnabled).toBe(true);
  });
});

describe("Re-enabling after a disable", () => {
  it("issues a FRESH secret and a FRESH set of recovery codes", async () => {
    const first = await login(ADMIN);
    const { secret: originalSecret, response: firstEnrol } = await enrol(first.headers["set-cookie"]);
    const originalCodes = firstEnrol.body.data.recoveryCodes;

    const second = await login(ADMIN);
    const verified = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: generateSync({ secret: originalSecret }) });
    const session = verified.headers["set-cookie"];

    await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: ADMIN.password, token: generateSync({ secret: originalSecret }) })
      .expect(200);

    // Now signs in with no second factor, and re-enrols from that session.
    const afterDisable = await login(ADMIN);
    const newSession = afterDisable.headers["set-cookie"];
    expect(newSession).toBeDefined();

    const start = await request(app).post("/api/v1/auth/2fa/enrol/start").set("Cookie", newSession).send({});
    const newSecret = start.body.data.secret;
    const confirm = await request(app)
      .post("/api/v1/auth/2fa/enrol/confirm")
      .set("Cookie", newSession)
      .send({ token: generateSync({ secret: newSecret }) });

    expect(confirm.status).toBe(200);
    expect(newSecret).not.toBe(originalSecret);

    const newCodes = confirm.body.data.recoveryCodes;
    expect(newCodes).toHaveLength(10);
    // Not one of the old codes survives — they were cleared on disable and a
    // whole new set minted, so an old code must not still open the door.
    expect(newCodes.filter((code) => originalCodes.includes(code))).toHaveLength(0);
  });

  it("will not accept an OLD recovery code after re-enrolling", async () => {
    const first = await login(ADMIN);
    const { secret, response: firstEnrol } = await enrol(first.headers["set-cookie"]);
    const [oldCode] = firstEnrol.body.data.recoveryCodes;

    const second = await login(ADMIN);
    const verified = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
      .send({ token: generateSync({ secret }) });

    await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", verified.headers["set-cookie"])
      .send({ password: ADMIN.password, token: generateSync({ secret }) })
      .expect(200);

    const afterDisable = await login(ADMIN);
    const newSession = afterDisable.headers["set-cookie"];
    const start = await request(app).post("/api/v1/auth/2fa/enrol/start").set("Cookie", newSession).send({});
    await request(app)
      .post("/api/v1/auth/2fa/enrol/confirm")
      .set("Cookie", newSession)
      .send({ token: generateSync({ secret: start.body.data.secret }) });

    const relogin = await login(ADMIN);
    const replay = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${relogin.body.data.preAuthToken}`)
      .send({ token: oldCode });

    expect(replay.status).toBe(401);
    expect(replay.headers["set-cookie"]).toBeUndefined();
  });
});
