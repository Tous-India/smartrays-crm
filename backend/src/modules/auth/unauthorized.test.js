import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { generateSync } from "otplib";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDb.js";
import { getTestApp } from "../../../tests/helpers/testApp.js";
import { createUserDirectly } from "../../../tests/helpers/authHelpers.js";
import User from "../user/user.model.js";

/**
 * The 401 contract (2026-08-08).
 *
 * A 401 means two completely different things in this API:
 *
 *   - "the credential identifying you is missing/expired/invalid" — your
 *     session is dead, and the client should send you to /login.
 *   - "the secret you just typed was wrong" — your session is perfectly fine,
 *     and the client should show you the message and let you retry.
 *
 * The frontend could not tell them apart. Its interceptor redirected on every
 * 401 except `/auth/login`, so a mistyped password on 2FA-disable signed the
 * user out instead of showing "Your password is incorrect" — the modal
 * unmounted before the error could render.
 *
 * The fix is on this side: session-expiry 401s now carry
 * `errors: [{ code: "SESSION_EXPIRED" }]`, and the client redirects ONLY on
 * that. These tests pin the contract in both directions — a marker that goes
 * missing would silently break sign-out, and a marker that leaks onto a
 * credential rejection would resurrect this bug.
 */

let app;

const ADMIN = { email: "admin@401.local", password: "AdminPass123!" };
const SESSION_EXPIRED = "SESSION_EXPIRED";

function codesOf(response) {
  return (response.body.errors || []).map((entry) => entry.code);
}

function login({ email, password }) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}

/** Enrols the admin and returns a real session cookie plus their secret. */
async function enrolledSession() {
  const first = await login(ADMIN);
  const session = first.headers["set-cookie"];

  const start = await request(app).post("/api/v1/auth/2fa/enrol/start").set("Cookie", session).send({});
  const secret = start.body.data.secret;

  await request(app)
    .post("/api/v1/auth/2fa/enrol/confirm")
    .set("Cookie", session)
    .send({ token: generateSync({ secret }) });

  const second = await login(ADMIN);
  const verified = await request(app)
    .post("/api/v1/auth/2fa/verify")
    .set("Authorization", `Bearer ${second.body.data.preAuthToken}`)
    .send({ token: generateSync({ secret }) });

  return { secret, session: verified.headers["set-cookie"] };
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
  await createUserDirectly({ name: "Admin", ...ADMIN, role: "admin" });
});

describe("session-expiry 401s are MARKED — the client must redirect on these", () => {
  it("marks a request with no session cookie at all", async () => {
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(codesOf(response)).toContain(SESSION_EXPIRED);
  });

  it("marks a malformed or expired session token", async () => {
    const response = await request(app).get("/api/v1/auth/me").set("Cookie", ["test_token=not-a-real-jwt"]);

    expect(response.status).toBe(401);
    expect(codesOf(response)).toContain(SESSION_EXPIRED);
  });

  it("marks a pre-auth token presented as though it were a session", async () => {
    const first = await login(ADMIN);
    const start = await request(app)
      .post("/api/v1/auth/2fa/enrol/start")
      .set("Cookie", first.headers["set-cookie"])
      .send({});
    await request(app)
      .post("/api/v1/auth/2fa/enrol/confirm")
      .set("Cookie", first.headers["set-cookie"])
      .send({ token: generateSync({ secret: start.body.data.secret }) });

    const second = await login(ADMIN);
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", [`test_token=${second.body.data.preAuthToken}`]);

    expect(response.status).toBe(401);
    expect(codesOf(response)).toContain(SESSION_EXPIRED);
  });

  it("marks a session whose user no longer exists", async () => {
    const first = await login(ADMIN);
    const session = first.headers["set-cookie"];

    await User.deleteMany({ email: ADMIN.email });

    const response = await request(app).get("/api/v1/auth/me").set("Cookie", session);

    expect(response.status).toBe(401);
    expect(codesOf(response)).toContain(SESSION_EXPIRED);
  });

  it("marks a missing or expired PRE-AUTH token on the 2FA endpoints", async () => {
    const missing = await request(app).post("/api/v1/auth/2fa/verify").send({ token: "123456" });
    expect(missing.status).toBe(401);
    expect(codesOf(missing)).toContain(SESSION_EXPIRED);

    const invalid = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", "Bearer not-a-real-token")
      .send({ token: "123456" });
    expect(invalid.status).toBe(401);
    expect(codesOf(invalid)).toContain(SESSION_EXPIRED);
  });
});

describe("credential-rejection 401s are NOT marked — the client must show the message", () => {
  it("does not mark a wrong password on 2FA-disable, and says which credential failed", async () => {
    const { secret, session } = await enrolledSession();

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: "WrongPassword123!", token: generateSync({ secret }) });

    expect(response.status).toBe(401);
    expect(codesOf(response)).not.toContain(SESSION_EXPIRED);
    expect(response.body.message).toMatch(/password is incorrect/i);
  });

  it("does not mark a wrong CODE on 2FA-disable, and says something different from the password error", async () => {
    const { session } = await enrolledSession();

    const response = await request(app)
      .post("/api/v1/auth/2fa/disable")
      .set("Cookie", session)
      .send({ password: ADMIN.password, token: "000000" });

    expect(response.status).toBe(401);
    expect(codesOf(response)).not.toContain(SESSION_EXPIRED);
    // Distinguishable from the password failure, so the user is told which
    // half they got wrong.
    expect(response.body.message).toMatch(/code isn't valid/i);
    expect(response.body.message).not.toMatch(/password/i);
  });

  it("does not mark a wrong current password on change-password", async () => {
    const first = await login(ADMIN);

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Cookie", first.headers["set-cookie"])
      .send({ currentPassword: "WrongPassword123!", newPassword: "BrandNewPass123!" });

    expect(response.status).toBe(401);
    expect(codesOf(response)).not.toContain(SESSION_EXPIRED);
    expect(response.body.message).toMatch(/current password is incorrect/i);
  });

  it("does not mark the admin-reset re-authentication failure", async () => {
    const { session } = await enrolledSession();
    const victim = await createUserDirectly({
      name: "Victim",
      email: "victim@401.local",
      password: "Password123",
      role: "employee",
    });

    const response = await request(app)
      .post("/api/v1/auth/2fa/admin-reset")
      .set("Cookie", session)
      .send({ targetUserId: String(victim._id), password: "WrongPassword123!", token: "000000" });

    expect(response.status).toBe(401);
    expect(codesOf(response)).not.toContain(SESSION_EXPIRED);
    expect(response.body.message).toMatch(/password is incorrect/i);
  });

  it("does not mark a wrong code during enrolment confirmation", async () => {
    const first = await login(ADMIN);
    const session = first.headers["set-cookie"];
    await request(app).post("/api/v1/auth/2fa/enrol/start").set("Cookie", session).send({});

    const response = await request(app)
      .post("/api/v1/auth/2fa/enrol/confirm")
      .set("Cookie", session)
      .send({ token: "000000" });

    expect(response.status).toBe(401);
    expect(codesOf(response)).not.toContain(SESSION_EXPIRED);
  });

  it("does not mark a wrong email/password at login", async () => {
    const response = await login({ email: ADMIN.email, password: "WrongPassword123!" });

    expect(response.status).toBe(401);
    expect(codesOf(response)).not.toContain(SESSION_EXPIRED);
    expect(response.body.message).toMatch(/invalid email or password/i);
  });

  it("does not mark a wrong second factor at the login challenge", async () => {
    const { secret } = await enrolledSession();
    expect(secret).toBeTruthy();

    const again = await login(ADMIN);
    const response = await request(app)
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${again.body.data.preAuthToken}`)
      .send({ token: "000000" });

    // The token identifying the attempt is fine; the code typed into it wasn't.
    expect(response.status).toBe(401);
    expect(codesOf(response)).not.toContain(SESSION_EXPIRED);
  });
});
