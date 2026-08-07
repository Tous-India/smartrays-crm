import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROUTE_PATHS } from "../constants/routePaths.constants";

/**
 * Tickets was DEFERRED from the UI 2026-08-07 — hidden, not removed.
 *
 * The failure this guards against is specific and has already happened once in
 * this codebase: `/amc` was retired months ago and `AmcRenewalsDueWidget` has
 * been linking to the dead route ever since, because nothing checked. A
 * deferral is only safe if the links go with it.
 *
 * Deliberately NOT flagged: `ticketApi.js`'s `apiClient.get("/tickets")`. That
 * is a live BACKEND endpoint, which this task left completely untouched — the
 * Dashboard widget still calls it. Only client-side navigation to a route that
 * no longer exists is a defect, so this scans for router/link usage and not
 * for the string on its own.
 */

// Resolved from this file, not `process.cwd()` — the eslint config has no
// node globals for test files, and cwd-relative paths silently break whenever
// vitest is invoked from anywhere but the package root.
const SRC = path.resolve(import.meta.dirname, "..");

/** Strips comments, so the deliberate "restore it like this" notes don't trip. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(full);
    }

    return /\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

// Client-side navigation only — never a bare string, which would match the API call.
const NAVIGATION_TO_TICKETS = [
  /to=["'`]\/tickets/,
  /to=\{\s*ROUTE_PATHS\.TICKET/,
  /navigate\(\s*["'`]\/tickets/,
  /href=["'`]\/tickets/,
  /<Route[^>]*path=["'`]tickets/,
  /ROUTE_PATHS\.TICKETS\b/,
  /ROUTE_PATHS\.TICKET_DETAIL\b/,
];

describe("Tickets is deferred from the UI", () => {
  const files = sourceFiles(SRC);

  it("scans a real, non-trivial number of source files", () => {
    // A broken walker that found nothing would make every assertion below
    // vacuously pass — the exact way this kind of guard rots silently.
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no client-side navigation to /tickets anywhere in src/", () => {
    const offenders = files.filter((file) => {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      return NAVIGATION_TO_TICKETS.some((pattern) => pattern.test(code));
    });

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("exposes no TICKETS route constant to link to", () => {
    expect(ROUTE_PATHS.TICKETS).toBeUndefined();
    expect(ROUTE_PATHS.TICKET_DETAIL).toBeUndefined();
  });

  it("imports no removed Tickets page", () => {
    const offenders = files.filter((file) =>
      /from\s+["'].*\/(TicketsPage|TicketDetailPage)["']/.test(stripComments(fs.readFileSync(file, "utf8")))
    );

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
    expect(fs.existsSync(path.join(SRC, "pages/TicketsPage.jsx"))).toBe(false);
    expect(fs.existsSync(path.join(SRC, "pages/TicketDetailPage.jsx"))).toBe(false);
  });

  it("keeps the ticket API module, which the Dashboard widget still uses", () => {
    // "Hide, do not delete": the backend is untouched and the Open Tickets
    // widget still reports real counts. Deleting the api module here is what
    // would actually break something.
    expect(fs.existsSync(path.join(SRC, "modules/ticket/api/ticketApi.js"))).toBe(true);
  });
});
