import request from "supertest";

/**
 * Creates a user directly in the database, bypassing the register endpoint's
 * admin gate — the same shortcut src/scripts/seedAdmin.js uses to create the
 * very first admin. All imports here are dynamic (deferred until the
 * function actually runs, inside a beforeAll/beforeEach) for the same reason
 * as testApp.js: env.js must already be configured before src/ is touched.
 */
export async function createUserDirectly({ name, email, password, role, managerId, permissions }) {
  const { default: bcrypt } = await import("bcryptjs");
  const { default: User } = await import("../../src/modules/user/user.model.js");

  const passwordHash = await bcrypt.hash(password, 10);

  return User.create({
    name,
    email,
    passwordHash,
    role,
    managerId: managerId || null,
    permissions: permissions || {},
  });
}

/**
 * Logs in as the given user and returns a supertest agent with the session
 * cookie already attached — every subsequent request made through this agent
 * is authenticated as that user.
 */
/**
 * Logs a fixture in and returns an authenticated supertest agent.
 *
 * **2FA (§7.38, 2026-08-05):** 2FA is mandatory for admin and manager, so a
 * fresh fixture of either role is stopped at the enrolment gate and never
 * receives a session cookie. Every suite in this project other than the 2FA
 * suite itself is testing something else entirely and just needs a working
 * session, so this helper marks such fixtures as ALREADY ENROLLED before
 * logging in — the realistic steady state for an existing account, rather
 * than every unrelated test having to walk the enrolment flow.
 *
 * `twoFactor.test.js` deliberately does NOT use this path for the flows it
 * exercises; it drives real login/enrolment/verification end to end.
 */
export async function loginAsAgent(app, email, password) {
  const agent = request.agent(app);

  // Dynamic imports, matching this file's existing convention (see
  // createUserDirectly): models must not be imported at module load time,
  // before the in-memory database is up.
  const { default: User } = await import("../../src/modules/user/user.model.js");

  let response = await agent.post("/api/v1/auth/login").send({ email, password }).expect(200);

  // Login returns 200 for the 2FA challenge too, but WITHOUT a session cookie,
  // so a naive `.expect(200)` hands back an unauthenticated agent and every
  // later request 401s. When a fixture hits it, actually COMPLETE the second
  // factor rather than trying to switch it off. Provisioning a known secret
  // and submitting a real TOTP keeps every other suite exercising the genuine
  // login path.
  //
  // `requiresEnrolment` was also checked here until 2026-08-08, for the
  // admin/manager mandatory-enrolment gate. That gate is gone — a user with
  // 2FA off now logs straight in — so `requiresTwoFactor` is the only case
  // left that withholds a session.
  if (response.body?.data?.requiresTwoFactor) {
    const { generateSecret, generateSync } = await import("otplib");
    const { encryptCredential } = await import("../../src/services/credentialEncryption.service.js");

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

    response = await agent.post("/api/v1/auth/login").send({ email, password }).expect(200);

    await agent
      .post("/api/v1/auth/2fa/verify")
      .set("Authorization", `Bearer ${response.body.data.preAuthToken}`)
      .send({ token: generateSync({ secret }) })
      .expect(200);
  }

  return agent;
}
