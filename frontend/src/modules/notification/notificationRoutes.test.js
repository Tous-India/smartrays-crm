import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MODULE_ROUTES, routeForNotification } from "./notificationRoutes";

/**
 * §6.7 (2026-08-07) — a push and an in-app click must land in the same place.
 *
 * `public/sw.js` cannot import from `src/`: a service worker is a standalone
 * script served from the site root. So the route table exists twice by
 * necessity, and this file is the only thing keeping the copies honest — it
 * parses the real `sw.js` off disk and compares.
 */

const SW_PATH = path.resolve(process.cwd(), "public/sw.js");

/** Pulls `key: (id) => \`...\`` pairs out of the service worker's own source. */
function parseServiceWorkerRoutes() {
  const source = fs.readFileSync(SW_PATH, "utf8");
  const block = source.match(/const MODULE_ROUTES = \{([\s\S]*?)\n\};/);

  if (!block) {
    throw new Error("MODULE_ROUTES not found in public/sw.js");
  }

  const routes = {};

  for (const line of block[1].split("\n")) {
    // Two shapes in the table: `(id) => ` + "`/leads/${id}`" + ` (template
    // literal) and `() => "/attendance"` (plain string). Matching only the
    // first is how the initial version of this guard silently ignored half
    // the table and still reported green.
    const match = line.match(/(\w+):\s*\((\w*)\)\s*=>\s*(?:`([^`]*)`|"([^"]*)")/);

    if (match) {
      const [, key, arg, template, literal] = match;

      routes[key] =
        arg && template ? (id) => template.replace(`\${${arg}}`, id) : () => literal ?? template;
    }
  }

  return routes;
}

describe("service worker route table matches the app's", () => {
  const swRoutes = parseServiceWorkerRoutes();

  it("covers exactly the same modules", () => {
    expect(Object.keys(swRoutes).sort()).toEqual(Object.keys(MODULE_ROUTES).sort());
  });

  it.each(Object.keys(MODULE_ROUTES))("resolves %s to the same path in both", (module) => {
    expect(swRoutes[module]("abc123")).toBe(MODULE_ROUTES[module]("abc123"));
  });

  it("routes leave and attendance to /attendance, ignoring the id", () => {
    // The standalone /leave and /amc routes were removed; linking to a route
    // that no longer exists is a mistake this app has already shipped once.
    expect(MODULE_ROUTES.leave("anything")).toBe("/attendance");
    expect(swRoutes.attendance("anything")).toBe("/attendance");
  });
});

describe("routeForNotification", () => {
  const note = (module, id) => ({ relatedEntity: { module, id } });

  it("builds a per-record path where one exists", () => {
    expect(routeForNotification(note("leads", "lead-1"))).toBe("/leads/lead-1");
    expect(routeForNotification(note("tickets", "t-9"))).toBe("/tickets/t-9");
  });

  it("returns null for a module with no route rather than a broken path", () => {
    expect(routeForNotification(note("payroll", "p-1"))).toBeNull();
    expect(routeForNotification({})).toBeNull();
    expect(routeForNotification(null)).toBeNull();
  });

  it("returns null rather than /leads/undefined when the id is missing", () => {
    expect(routeForNotification(note("leads", undefined))).toBeNull();
    expect(routeForNotification(note("leads", null))).toBeNull();
  });

  it("still routes leave with no id — it does not need one", () => {
    expect(routeForNotification(note("leave", undefined))).toBe("/attendance");
  });
});

/**
 * The worker itself is exercised in a real browser (jsdom has no
 * ServiceWorkerGlobalScope), but its source can still be checked for the
 * decisions that matter.
 */
describe("public/sw.js", () => {
  const source = fs.readFileSync(SW_PATH, "utf8");

  it("handles push and notificationclick", () => {
    expect(source).toMatch(/addEventListener\("push"/);
    expect(source).toMatch(/addEventListener\("notificationclick"/);
  });

  it("focuses an existing tab before opening a new window", () => {
    // Opening a duplicate tab of an app the user already has open is the
    // most common service-worker annoyance, and it loses their page state.
    expect(source).toMatch(/matchAll/);
    expect(source).toMatch(/focus/);
    expect(source.indexOf("focus")).toBeLessThan(source.indexOf("openWindow"));
  });

  it("caches nothing — this app is not offline-capable", () => {
    // A cache here would serve stale HTML after a deploy, which is worse than
    // the problem push solves.
    expect(source).not.toMatch(/caches\.(open|match)/);
    expect(source).not.toMatch(/addEventListener\("fetch"/);
  });
});
