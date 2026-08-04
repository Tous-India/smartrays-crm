import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { startTestDatabase, stopTestDatabase } from "./tests/helpers/testDb.js";
import { getTestApp } from "./tests/helpers/testApp.js";

let app;

beforeAll(async () => {
  await startTestDatabase();
  app = await getTestApp();
});

afterAll(async () => {
  await stopTestDatabase();
});

/**
 * CORS multi-origin support (2026-08-04) — `testDb.js` defaults
 * `CLIENT_ORIGIN` to `"http://localhost:5173,http://localhost:5174"` (the
 * same two-value default the real `.env` now ships), so these tests exercise
 * the actual comma-separated parsing, not a mocked allowlist. CORS itself is
 * enforced by the BROWSER, not this server — a disallowed origin's request
 * still completes normally here, it just comes back with no
 * `Access-Control-Allow-Origin` header, which is what makes the browser
 * refuse to let the calling page read the response. These tests assert on
 * that header's presence/absence, not on the response status code.
 */
describe("CORS — multi-origin local dev support", () => {
  it("reflects Access-Control-Allow-Origin for the first allowed origin", async () => {
    const response = await request(app).get("/health").set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("reflects Access-Control-Allow-Origin for the second allowed origin too — proving the list is actually parsed, not just the first entry", async () => {
    const response = await request(app).get("/health").set("Origin", "http://localhost:5174");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does NOT reflect Access-Control-Allow-Origin for an origin outside the allowlist — CORS stays closed, not permissive", async () => {
    const response = await request(app).get("/health").set("Origin", "http://evil.example.com");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    // The request itself still completes server-side (CORS can't "reject" a
    // request server-side, only the browser enforces it) — but with no
    // Access-Control-Allow-Origin header, a real browser blocks the caller
    // from ever reading this body.
    expect(response.status).toBe(200);
  });

  it("still allows a request with no Origin header at all (curl, server-to-server) — matching the old static-string config's behavior", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
  });
});
