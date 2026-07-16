/**
 * Loads the Express app via a dynamic import so it only happens after
 * startTestDatabase() has set every env var src/config/env.js requires.
 * A static top-level `import app from "../../app.js"` would run before any
 * beforeAll() hook fires and crash on missing env vars — see testDb.js.
 */
export async function getTestApp() {
  const { default: app } = await import("../../app.js");
  return app;
}
