import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { generateSync } from "otplib";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly } from "../../../tests/helpers/authHelpers.js";
import User from "../user/user.model.js";
import { decryptCredential } from "../../services/credentialEncryption.service.js";
import { TRUSTED_DEVICE_COOKIE, MAX_TRUSTED_DEVICES } from "./trustedDevice.service.js";

let app;

const USER = { email: "trusted@device.local", password: "Password123" };
const OTHER = { email: "other@device.local", password: "Password123" };

function login({ email, password }, cookies = []) {
  return request(app).post("/api/v1/auth/login").set("Cookie", cookies).send({ email, password });
}

/** Pulls one named cookie's raw value out of a `set-cookie` header. */
function cookieValue(response, name) {
  const header = response.headers["set-cookie"] || [];
  const match = header.find((c) => c.startsWith(`${name}=`));

  if (!match) {
    return undefined;
  }

  return match.split(";")[0].slice(name.length + 1);
}

function cookieAttributes(response, name) {
  return (response.headers["set-cookie"] || []).find((c) => c.startsWith(`${name}=`)) || "";
}

async function totpFor(email) {
  const user = await User.findOne({ email }).select("+twoFactorSecretEncrypted +twoFactorSecretIv");

  return generateSync({
    secret: decryptCredential({
      passwordEncrypted: user.twoFactorSecretEncrypted,
      passwordIv: user.twoFactorSecretIv,
    }),
  });
}

/** Password → 2FA verify, optionally ticking "remember this device". */
async function signIn(credentials, { remember = false, token } = {}) {
  const first = await login(credentials);
  const code = token || (await totpFor(credentials.email));

  const verify = await request(app)
    .post("/api/v1/auth/2fa/verify")
    .set("Authorization", `Bearer ${first.body.data.preAuthToken}`)
    .send({ token: code, rememberDevice: remember });

  return { first, verify, deviceToken: cookieValue(verify, TRUSTED_DEVICE_COOKIE) };
}

/**
 * Enrols a user in 2FA and returns their recovery codes.
 *
 * Every user enrols the same way now (2026-08-08): from a real session, the
 * way an employee always did. The admin/manager mandate that used to hold
 * those roles at an enrolment gate with only a pre-auth token is gone, along
 * with the `authenticateEither` middleware that existed to serve it.
 */
async function enrolViaApi(credentials) {
  const first = await login(credentials);

  const auth = (req) =>
    first.body.data?.preAuthToken
      ? req.set("Authorization", `Bearer ${first.body.data.preAuthToken}`)
      : req.set("Cookie", first.headers["set-cookie"]);

  const start = await auth(request(app).post("/api/v1/auth/2fa/enrol/start")).send({});

  const confirm = await auth(request(app).post("/api/v1/auth/2fa/enrol/confirm")).send({
    token: generateSync({ secret: start.body.data.secret }),
  });

  return confirm.body.data.recoveryCodes;
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
  // `employee` rather than admin/manager: 2FA is optional for this role, so
  // enrolment here is a deliberate act rather than a mandatory gate, which
  // keeps these tests about trusted devices and not about the gate.
  await createUserDirectly({ name: "Trusted", ...USER, role: "employee" });
  await createUserDirectly({ name: "Other", ...OTHER, role: "employee" });
  await enrolViaApi(USER);
  await enrolViaApi(OTHER);
});

describe("Remember this device — issuing", () => {
  it("issues a device cookie only when the box was ticked", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });

    expect(deviceToken).toBeTruthy();
  });

  it("issues NO device cookie by default", async () => {
    const { deviceToken } = await signIn(USER);

    expect(deviceToken).toBeUndefined();
  });

  it("stores a HASH, never the token itself", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });

    const user = await User.findOne({ email: USER.email }).select("+trustedDevices");

    expect(user.trustedDevices).toHaveLength(1);
    expect(user.trustedDevices[0].tokenHash).not.toBe(deviceToken);
    expect(user.trustedDevices[0].tokenHash.startsWith("$2")).toBe(true);
  });

  it("uses the same cookie options as the session cookie — httpOnly, SameSite=Lax", async () => {
    const { verify } = await signIn(USER, { remember: true });
    const attributes = cookieAttributes(verify, TRUSTED_DEVICE_COOKIE);

    expect(attributes).toMatch(/HttpOnly/i);
    expect(attributes).toMatch(/SameSite=Lax/i);
  });

  it("labels the device from the User-Agent so the revoke list is readable", async () => {
    const first = await login(USER);

    await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${first.body.data.preAuthToken}`)
      .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36")
      .send({ token: await totpFor(USER.email), rememberDevice: true });

    const user = await User.findOne({ email: USER.email }).select("+trustedDevices");

    expect(user.trustedDevices[0].label).toBe("Chrome on Windows");
  });
});

describe("Remember this device — skipping the second factor", () => {
  it("skips the code on the next login and issues a session directly", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });

    const second = await login(USER, [`${TRUSTED_DEVICE_COOKIE}=${deviceToken}`]);

    expect(second.status).toBe(200);
    expect(second.body.data.preAuthToken).toBeUndefined();
    expect(second.headers["set-cookie"]).toBeDefined();
    expect(second.body.data.email).toBe(USER.email);
  });

  it("still demands the code with no device cookie", async () => {
    await signIn(USER, { remember: true });

    const second = await login(USER);

    expect(second.body.data.requiresTwoFactor).toBe(true);
    expect(second.body.data.preAuthToken).toBeTruthy();
  });

  /**
   * THE load-bearing assertion of this whole feature. A trusted device skips
   * the SECOND factor; the password is always required. If this ever passes
   * with a wrong password, the device cookie has become a standalone
   * credential and the feature is a backdoor.
   */
  it("REFUSES a wrong password even from a trusted device", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });

    const second = await login(
      { email: USER.email, password: "WrongPassword123" },
      [`${TRUSTED_DEVICE_COOKIE}=${deviceToken}`]
    );

    expect(second.status).toBe(401);
    expect(second.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses a login with no password at all, device cookie or not", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });

    const second = await request(app)
      .post("/api/v1/auth/login")
      .set("Cookie", [`${TRUSTED_DEVICE_COOKIE}=${deviceToken}`])
      .send({ email: USER.email });

    expect(second.status).toBe(400);
  });

  it("does NOT let one user's device token skip 2FA on another account", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });

    const second = await login(OTHER, [`${TRUSTED_DEVICE_COOKIE}=${deviceToken}`]);

    expect(second.body.data.requiresTwoFactor).toBe(true);
    expect(second.body.data.preAuthToken).toBeTruthy();
  });

  it("rejects a garbage device cookie and clears it", async () => {
    const second = await login(USER, [`${TRUSTED_DEVICE_COOKIE}=not-a-real-token`]);

    expect(second.body.data.requiresTwoFactor).toBe(true);
    // Cleared so the browser stops presenting a dead credential.
    expect(cookieAttributes(second, TRUSTED_DEVICE_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });
});

describe("Expiry and capacity", () => {
  it("does not honour an expired device, and prunes it", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });

    await User.updateOne(
      { email: USER.email },
      { $set: { "trustedDevices.0.expiresAt": new Date(Date.now() - 1000) } }
    );

    const second = await login(USER, [`${TRUSTED_DEVICE_COOKIE}=${deviceToken}`]);

    expect(second.body.data.requiresTwoFactor).toBe(true);

    const user = await User.findOne({ email: USER.email }).select("+trustedDevices");
    expect(user.trustedDevices).toHaveLength(0);
  });

  it(`caps the list at ${MAX_TRUSTED_DEVICES}, evicting the oldest`, async () => {
    for (let i = 0; i < MAX_TRUSTED_DEVICES + 3; i += 1) {
      // Sequential on purpose — each sign-in reads and rewrites the same
      // array, so running them in parallel would race on the document.
      // eslint-disable-next-line no-await-in-loop
      await signIn(USER, { remember: true });
      // eslint-disable-next-line no-await-in-loop
      await User.updateOne(
        { email: USER.email },
        { $set: { [`trustedDevices.${Math.min(i, MAX_TRUSTED_DEVICES - 1)}.createdAt`]: new Date(2020, 0, i + 1) } }
      );
    }

    const user = await User.findOne({ email: USER.email }).select("+trustedDevices");

    expect(user.trustedDevices.length).toBe(MAX_TRUSTED_DEVICES);
  });
});

/**
 * §7.40 item 4 — each of these means the earlier trust decision no longer
 * holds, so EVERY device must lose its trust, not just the current one.
 */
describe("Invalidation", () => {
  async function sessionCookieFor(credentials) {
    const { verify } = await signIn(credentials);

    return verify.headers["set-cookie"];
  }

  async function trustedDeviceCount(email) {
    const user = await User.findOne({ email }).select("+trustedDevices");

    return user.trustedDevices.length;
  }

  it("revokes every device on a password change", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });
    const session = await sessionCookieFor(USER);

    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Cookie", session)
      .send({ currentPassword: USER.password, newPassword: "BrandNewPass123" })
      .expect(200);

    expect(await trustedDeviceCount(USER.email)).toBe(0);

    const second = await login(
      { email: USER.email, password: "BrandNewPass123" },
      [`${TRUSTED_DEVICE_COOKIE}=${deviceToken}`]
    );
    expect(second.body.data.requiresTwoFactor).toBe(true);
  });

  it("revokes every device when a recovery code is redeemed", async () => {
    // A fresh enrolment, this time keeping the codes.
    await User.updateOne({ email: USER.email }, { $set: { twoFactorEnabled: false } });
    const [recoveryCode] = await enrolViaApi(USER);

    await signIn(USER, { remember: true });
    expect(await trustedDeviceCount(USER.email)).toBe(1);

    await signIn(USER, { token: recoveryCode });

    expect(await trustedDeviceCount(USER.email)).toBe(0);
  });

  it("does NOT create a trusted device when signing in with a recovery code", async () => {
    await User.updateOne({ email: USER.email }, { $set: { twoFactorEnabled: false } });
    const [recoveryCode] = await enrolViaApi(USER);

    // Ticking the box on a recovery-code sign-in must not mint a device: the
    // redeemed code is itself the signal that a device was lost.
    const { deviceToken } = await signIn(USER, { token: recoveryCode, remember: true });

    expect(deviceToken).toBeFalsy();
    expect(await trustedDeviceCount(USER.email)).toBe(0);
  });

  it("revokes every device on re-enrolment", async () => {
    await signIn(USER, { remember: true });
    const session = await sessionCookieFor(USER);

    // The flag is flipped straight in the database rather than through
    // `clearTwoFactor`, which revokes devices itself — that would make this
    // pass without `confirmTotpEnrolment` doing anything. The device has to
    // survive INTO the re-enrolment for this to test the right thing.
    await User.updateOne({ email: USER.email }, { $set: { twoFactorEnabled: false } });
    expect(await trustedDeviceCount(USER.email)).toBe(1);

    const start = await request(app).post("/api/v1/auth/2fa/enrol/start").set("Cookie", session).send({});
    await request(app)
      .post("/api/v1/auth/2fa/enrol/confirm")
      .set("Cookie", session)
      .send({ token: generateSync({ secret: start.body.data.secret }) })
      .expect(200);

    expect(await trustedDeviceCount(USER.email)).toBe(0);
  });

  it("revokes every device when an admin resets that user's 2FA", async () => {
    await signIn(USER, { remember: true });

    await createUserDirectly({
      name: "Reset Admin",
      email: "reset@device.local",
      password: "AdminPass123!",
      role: "admin",
    });
    await enrolViaApi({ email: "reset@device.local", password: "AdminPass123!" });
    const adminFirst = await login({ email: "reset@device.local", password: "AdminPass123!" });
    const adminVerify = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${adminFirst.body.data.preAuthToken}`)
      .send({ token: await totpFor("reset@device.local") });

    const target = await User.findOne({ email: USER.email });

    await request(app)
      .post("/api/v1/auth/2fa/admin-reset")
      .set("Cookie", adminVerify.headers["set-cookie"])
      .send({
        targetUserId: String(target._id),
        password: "AdminPass123!",
        token: await totpFor("reset@device.local"),
      })
      .expect(200);

    expect(await trustedDeviceCount(USER.email)).toBe(0);
  });
});

describe("Managing trusted devices", () => {
  async function sessionFor(credentials) {
    const { verify } = await signIn(credentials);

    return verify.headers["set-cookie"];
  }

  it("lists devices without ever exposing the hash", async () => {
    await signIn(USER, { remember: true });
    const session = await sessionFor(USER);

    const response = await request(app).get("/api/v1/auth/trusted-devices").set("Cookie", session);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).not.toHaveProperty("tokenHash");
    expect(response.body.data[0].label).toBeTruthy();
  });

  it("revokes a single device, and that device then needs a code again", async () => {
    const { deviceToken } = await signIn(USER, { remember: true });
    const session = await sessionFor(USER);

    const list = await request(app).get("/api/v1/auth/trusted-devices").set("Cookie", session);

    await request(app)
      .delete(`/api/v1/auth/trusted-devices/${list.body.data[0]._id}`)
      .set("Cookie", session)
      .expect(200);

    const second = await login(USER, [`${TRUSTED_DEVICE_COOKIE}=${deviceToken}`]);
    expect(second.body.data.requiresTwoFactor).toBe(true);
  });

  it("revokes all devices at once", async () => {
    await signIn(USER, { remember: true });
    await signIn(USER, { remember: true });
    const session = await sessionFor(USER);

    await request(app).delete("/api/v1/auth/trusted-devices").set("Cookie", session).expect(200);

    const user = await User.findOne({ email: USER.email }).select("+trustedDevices");
    expect(user.trustedDevices).toHaveLength(0);
  });

  it("cannot revoke someone else's device — the id is scoped to the caller", async () => {
    await signIn(OTHER, { remember: true });
    const otherUser = await User.findOne({ email: OTHER.email }).select("+trustedDevices");
    const victimDeviceId = otherUser.trustedDevices[0]._id;

    const session = await sessionFor(USER);

    await request(app)
      .delete(`/api/v1/auth/trusted-devices/${victimDeviceId}`)
      .set("Cookie", session)
      .expect(200);

    const after = await User.findOne({ email: OTHER.email }).select("+trustedDevices");
    expect(after.trustedDevices).toHaveLength(1);
  });

  it("refuses a pre-auth token — managing trust is a post-authentication action", async () => {
    const first = await login(USER);

    const response = await request(app)
      .get("/api/v1/auth/trusted-devices")
      .set("Authorization", `Bearer ${first.body.data.preAuthToken}`);

    expect([401, 403]).toContain(response.status);
  });

  it("refuses an unauthenticated caller", async () => {
    const response = await request(app).get("/api/v1/auth/trusted-devices");

    expect(response.status).toBe(401);
  });
});
