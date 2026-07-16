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
export async function loginAsAgent(app, email, password) {
  const agent = request.agent(app);

  await agent.post("/api/v1/auth/login").send({ email, password }).expect(200);

  return agent;
}
