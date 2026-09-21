import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { generateSecret, generateSync } from "otplib";
import { startTestDatabase, stopTestDatabase, clearAllCollections } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly, loginAsAgent } from "../../../tests/helpers/authHelpers.js";
import { encryptCredential } from "../../services/credentialEncryption.service.js";
import User from "../user/user.model.js";

/**
 * Bearer auth for the mobile app (mobile-backend-plan.md §1), beside the
 * cookie auth the web app uses.
 *
 * Everything here goes through HTTP on purpose — nothing imports the new
 * model or service — so the whole file runs against the pre-change code and
 * fails there for the right reason (404 on the new routes, 401 on a Bearer
 * session) rather than at import time. The refresh-token collection is read
 * straight through the mongoose connection for the same reason.
 */

let app;

const EMPLOYEE = { email: "employee@test.local", password: "EmployeePass123!" };
const MANAGER = { email: "manager@test.local", password: "ManagerPass123!" };
const ADMIN = { email: "admin@test.local", password: "AdminPass123!" };

const MOBILE_LOGIN = "/api/v1/auth/mobile/login";
const MOBILE_VERIFY = "/api/v1/auth/mobile/2fa/verify";
const MOBILE_REFRESH = "/api/v1/auth/mobile/refresh";
const MOBILE_LOGOUT = "/api/v1/auth/mobile/logout";

function refreshTokens() {
  return mongoose.connection.db.collection("refreshtokens");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mobileLogin(credentials, extra = {}) {
  return request(app).post(MOBILE_LOGIN).send({ ...credentials, ...extra });
}

/** Enables TOTP on a fixture the same way authHelpers does, returning the secret. */
async function enableTwoFactor(email) {
  const secret = generateSecret();
  const { passwordEncrypted, passwordIv } = encryptCredential(secret);

  await User.updateOne(
    { email },
    {
      $set: {
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: passwordEncrypted,
        twoFactorSecretIv: passwordIv,
        twoFactorFailedAttempts: 0,
      },
    }
  );

  return secret;
}

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

beforeEach(async () => {
  await clearAllCollections();
  await createUserDirectly({ name: "Employee", ...EMPLOYEE, role: "employee" });
  await createUserDirectly({ name: "Manager", ...MANAGER, role: "manager" });
  await createUserDirectly({ name: "Admin", ...ADMIN, role: "admin" });
});

describe("POST /auth/mobile/login", () => {
  it("returns the user, an access token, its lifetime and a refresh token — and sets NO cookie", async () => {
    const response = await mobileLogin(EMPLOYEE).expect(200);

    expect(response.body.data.user.email).toBe(EMPLOYEE.email);
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(typeof response.body.data.accessToken).toBe("string");
    expect(typeof response.body.data.refreshToken).toBe("string");
    expect(response.body.data.accessExpiresIn).toBe(15 * 60);
    expect(response.headers["set-cookie"]).toBeUndefined();

    // The access token is an ordinary session JWT — same `{ userId }` shape
    // the web verifies — marked `aud: "mobile"` and short-lived.
    const decoded = jwt.decode(response.body.data.accessToken);
    expect(decoded.userId).toBeDefined();
    expect(decoded.aud).toBe("mobile");
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  it("rejects a wrong password with the same 401 the web login gives", async () => {
    const response = await mobileLogin({ ...EMPLOYEE, password: "nope" }).expect(401);

    expect(response.body.message).toBe("Invalid email or password");
    expect(response.body.data).toBeUndefined();
  });

  it("rejects a deactivated account with 403", async () => {
    await User.updateOne({ email: EMPLOYEE.email }, { $set: { isActive: false } });

    await mobileLogin(EMPLOYEE).expect(403);
  });

  it("validates the body exactly like the web login", async () => {
    await request(app).post(MOBILE_LOGIN).send({ email: "not-an-email", password: "x" }).expect(400);
    await request(app).post(MOBILE_LOGIN).send({ email: EMPLOYEE.email }).expect(400);
  });

  it("stores only a SHA-256 hash of the refresh token, with the device it was issued to", async () => {
    const response = await mobileLogin(EMPLOYEE, { deviceId: "device-A", deviceLabel: "Pixel 8" }).expect(200);
    const raw = response.body.data.refreshToken;

    const stored = await refreshTokens().find({}).toArray();

    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).toBe(sha256(raw));
    expect(stored[0].tokenHash).not.toBe(raw);
    expect(stored[0].deviceId).toBe("device-A");
    expect(stored[0].deviceLabel).toBe("Pixel 8");
    expect(stored[0].revokedAt).toBeNull();
    expect(stored[0].replacedByHash).toBeNull();
    expect(new Date(stored[0].expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });
});

describe("authenticate — cookie first, Bearer only when there is no cookie", () => {
  it("accepts the mobile access token as a Bearer session", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .expect(200);

    expect(me.body.data.email).toBe(EMPLOYEE.email);
  });

  it("prefers the cookie when BOTH a cookie and a Bearer token are presented", async () => {
    const webAgent = await loginAsAgent(app, MANAGER.email, MANAGER.password);
    const mobile = await mobileLogin(EMPLOYEE).expect(200);

    // The agent carries the manager's cookie; the header carries the
    // employee's token. The cookie wins, so the web path is untouched even
    // by a stray header.
    const me = await webAgent
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${mobile.body.data.accessToken}`)
      .expect(200);

    expect(me.body.data.email).toBe(MANAGER.email);
  });

  it("still answers SESSION_EXPIRED with neither cookie nor Bearer", async () => {
    const response = await request(app).get("/api/v1/auth/me").expect(401);

    expect(response.body.errors[0].code).toBe("SESSION_EXPIRED");
  });

  it("never accepts a REFRESH token as a session credential", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.data.refreshToken}`)
      .expect(401);

    expect(response.body.errors[0].code).toBe("SESSION_EXPIRED");
  });

  it("never accepts a PRE-AUTH token as a Bearer session either", async () => {
    await enableTwoFactor(EMPLOYEE.email);
    const challenge = await mobileLogin(EMPLOYEE).expect(200);

    expect(challenge.body.data.requiresTwoFactor).toBe(true);

    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${challenge.body.data.preAuthToken}`)
      .expect(401);
  });

  it("rejects a Bearer token for a deactivated account with 403, as the cookie path does", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);
    await User.updateOne({ email: EMPLOYEE.email }, { $set: { isActive: false } });

    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .expect(403);
  });
});

describe("the web cookie flow is unchanged", () => {
  it("POST /auth/login still sets the session cookie and returns only the user", async () => {
    const response = await request(app).post("/api/v1/auth/login").send(EMPLOYEE).expect(200);

    expect(response.headers["set-cookie"].some((cookie) => cookie.startsWith(`${process.env.COOKIE_NAME}=`))).toBe(true);
    expect(response.body.data.email).toBe(EMPLOYEE.email);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
  });

  it("a web login writes no refresh-token record", async () => {
    await request(app).post("/api/v1/auth/login").send(EMPLOYEE).expect(200);

    expect(await refreshTokens().countDocuments()).toBe(0);
  });
});

describe("POST /auth/mobile/refresh", () => {
  it("rotates: returns a new pair, and the presented refresh token is retired", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);
    const first = login.body.data.refreshToken;

    const refreshed = await request(app).post(MOBILE_REFRESH).send({ refreshToken: first }).expect(200);

    expect(typeof refreshed.body.data.accessToken).toBe("string");
    expect(refreshed.body.data.accessExpiresIn).toBe(15 * 60);
    expect(refreshed.body.data.refreshToken).not.toBe(first);

    // The new access token is a working session.
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.data.accessToken}`)
      .expect(200);

    const old = await refreshTokens().findOne({ tokenHash: sha256(first) });
    expect(old.replacedByHash).toBe(sha256(refreshed.body.data.refreshToken));
    expect(old.lastUsedAt).not.toBeNull();
  });

  it("REUSE of a rotated token revokes every token for that device and answers SESSION_EXPIRED", async () => {
    const login = await mobileLogin(EMPLOYEE, { deviceId: "phone-1" }).expect(200);
    const first = login.body.data.refreshToken;
    const second = (await request(app).post(MOBILE_REFRESH).send({ refreshToken: first }).expect(200)).body.data
      .refreshToken;

    // Presenting `first` again: it was already replaced — stolen, or the app
    // lost its write. Either way the device's chain is dead.
    const reuse = await request(app).post(MOBILE_REFRESH).send({ refreshToken: first }).expect(401);
    expect(reuse.body.errors[0].code).toBe("SESSION_EXPIRED");

    await request(app).post(MOBILE_REFRESH).send({ refreshToken: second }).expect(401);

    const records = await refreshTokens().find({ deviceId: "phone-1" }).toArray();
    expect(records.every((record) => record.revokedAt !== null)).toBe(true);
  });

  it("reuse on one device does not touch another device's session", async () => {
    const phone = await mobileLogin(EMPLOYEE, { deviceId: "phone-1" }).expect(200);
    const tablet = await mobileLogin(EMPLOYEE, { deviceId: "tablet-1" }).expect(200);

    const phoneFirst = phone.body.data.refreshToken;
    await request(app).post(MOBILE_REFRESH).send({ refreshToken: phoneFirst }).expect(200);
    await request(app).post(MOBILE_REFRESH).send({ refreshToken: phoneFirst }).expect(401);

    await request(app).post(MOBILE_REFRESH).send({ refreshToken: tablet.body.data.refreshToken }).expect(200);
  });

  it("rejects an unknown token, an expired token, and an access token presented as a refresh token", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);

    const unknown = await request(app).post(MOBILE_REFRESH).send({ refreshToken: "not-a-real-token" }).expect(401);
    expect(unknown.body.errors[0].code).toBe("SESSION_EXPIRED");

    await request(app).post(MOBILE_REFRESH).send({ refreshToken: login.body.data.accessToken }).expect(401);

    await refreshTokens().updateOne(
      { tokenHash: sha256(login.body.data.refreshToken) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );
    const expired = await request(app)
      .post(MOBILE_REFRESH)
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(401);
    expect(expired.body.errors[0].code).toBe("SESSION_EXPIRED");
  });

  it("answers 403 for a deactivated account, so the app can tell it apart from an expired session", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);
    await User.updateOne({ email: EMPLOYEE.email }, { $set: { isActive: false } });

    await request(app).post(MOBILE_REFRESH).send({ refreshToken: login.body.data.refreshToken }).expect(403);
  });

  it("requires a refreshToken in the body", async () => {
    await request(app).post(MOBILE_REFRESH).send({}).expect(400);
    await request(app).post(MOBILE_REFRESH).send({ refreshToken: 42 }).expect(400);
  });
});

describe("POST /auth/mobile/logout", () => {
  it("revokes the presented refresh token; the short-lived access token runs out on its own", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);
    const { accessToken, refreshToken } = login.body.data;

    await request(app)
      .post(MOBILE_LOGOUT)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    const record = await refreshTokens().findOne({ tokenHash: sha256(refreshToken) });
    expect(record.revokedAt).not.toBeNull();

    const refresh = await request(app).post(MOBILE_REFRESH).send({ refreshToken }).expect(401);
    expect(refresh.body.errors[0].code).toBe("SESSION_EXPIRED");

    // The accepted trade-off of a stateless access token: it keeps working
    // until its 15 minutes are up. This pins the behaviour so it is a
    // decision, not a surprise.
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`).expect(200);
  });

  it("needs a session, and will not revoke another user's refresh token", async () => {
    const employee = await mobileLogin(EMPLOYEE).expect(200);
    const manager = await mobileLogin(MANAGER).expect(200);

    await request(app).post(MOBILE_LOGOUT).send({ refreshToken: employee.body.data.refreshToken }).expect(401);

    await request(app)
      .post(MOBILE_LOGOUT)
      .set("Authorization", `Bearer ${employee.body.data.accessToken}`)
      .send({ refreshToken: manager.body.data.refreshToken })
      .expect(200);

    // The manager's token was not the employee's to revoke.
    await request(app).post(MOBILE_REFRESH).send({ refreshToken: manager.body.data.refreshToken }).expect(200);
  });
});

describe("revocation on account events", () => {
  it("deactivating a user revokes every refresh token they hold", async () => {
    const login = await mobileLogin(EMPLOYEE, { deviceId: "phone-1" }).expect(200);
    const employee = await User.findOne({ email: EMPLOYEE.email });
    const adminAgent = await loginAsAgent(app, ADMIN.email, ADMIN.password);

    await adminAgent.patch(`/api/v1/users/${employee._id}/deactivate`).send({}).expect(200);

    const records = await refreshTokens().find({ userId: employee._id }).toArray();
    expect(records).toHaveLength(1);
    expect(records[0].revokedAt).not.toBeNull();

    await request(app).post(MOBILE_REFRESH).send({ refreshToken: login.body.data.refreshToken }).expect(403);
  });

  it("changing your own password revokes every refresh token", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);

    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: EMPLOYEE.password, newPassword: "NewEmployeePass123!" })
      .expect(200);

    const refresh = await request(app)
      .post(MOBILE_REFRESH)
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(401);
    expect(refresh.body.errors[0].code).toBe("SESSION_EXPIRED");
  });

  it("an admin password reset revokes every refresh token", async () => {
    const login = await mobileLogin(EMPLOYEE).expect(200);
    const employee = await User.findOne({ email: EMPLOYEE.email });
    const adminAgent = await loginAsAgent(app, ADMIN.email, ADMIN.password);

    await adminAgent.patch(`/api/v1/users/${employee._id}/reset-password`).send({}).expect(200);

    await request(app).post(MOBILE_REFRESH).send({ refreshToken: login.body.data.refreshToken }).expect(401);
  });
});

describe("two-factor over the mobile routes", () => {
  it("login with 2FA on returns the same challenge shape as the web, and no tokens", async () => {
    await enableTwoFactor(EMPLOYEE.email);

    const response = await mobileLogin(EMPLOYEE).expect(200);

    expect(response.body.data.requiresTwoFactor).toBe(true);
    expect(typeof response.body.data.preAuthToken).toBe("string");
    expect(response.body.data.email).toBe(EMPLOYEE.email);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(await refreshTokens().countDocuments()).toBe(0);
  });

  it("verify with a valid TOTP issues the token pair; with rememberDevice it also returns a trusted-device token", async () => {
    const secret = await enableTwoFactor(EMPLOYEE.email);
    const challenge = await mobileLogin(EMPLOYEE).expect(200);

    const verified = await request(app)
      .post(MOBILE_VERIFY)
      .set("Authorization", `Bearer ${challenge.body.data.preAuthToken}`)
      .send({ token: generateSync({ secret }), rememberDevice: true, deviceLabel: "Pixel 8" })
      .expect(200);

    expect(verified.body.data.user.email).toBe(EMPLOYEE.email);
    expect(typeof verified.body.data.accessToken).toBe("string");
    expect(typeof verified.body.data.refreshToken).toBe("string");
    expect(typeof verified.body.data.trustedDeviceToken).toBe("string");
    expect(verified.headers["set-cookie"]).toBeUndefined();

    // The trusted-device token, sent as a header, skips the second factor on
    // the next login — the same rule as the web's cookie.
    const trusted = await request(app)
      .post(MOBILE_LOGIN)
      .set("X-Trusted-Device", verified.body.data.trustedDeviceToken)
      .send(EMPLOYEE)
      .expect(200);

    expect(trusted.body.data.requiresTwoFactor).toBeUndefined();
    expect(typeof trusted.body.data.accessToken).toBe("string");
  });

  it("verify without rememberDevice returns no trusted-device token, and a wrong code is rejected", async () => {
    const secret = await enableTwoFactor(EMPLOYEE.email);
    const challenge = await mobileLogin(EMPLOYEE).expect(200);
    const preAuth = challenge.body.data.preAuthToken;

    await request(app).post(MOBILE_VERIFY).set("Authorization", `Bearer ${preAuth}`).send({ token: "000000" }).expect(401);

    const verified = await request(app)
      .post(MOBILE_VERIFY)
      .set("Authorization", `Bearer ${preAuth}`)
      .send({ token: generateSync({ secret }) })
      .expect(200);

    expect(verified.body.data.trustedDeviceToken).toBeUndefined();
  });

  it("verify refuses an ACCESS token where the pre-auth token belongs", async () => {
    const login = await mobileLogin(MANAGER).expect(200);

    await request(app)
      .post(MOBILE_VERIFY)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({ token: "123456" })
      .expect(401);
  });
});
