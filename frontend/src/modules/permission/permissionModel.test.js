import { describe, it, expect } from "vitest";
import {
  describeModule,
  permissionsToSelection,
  selectionToPermissions,
  selectionsToPermissions,
  buildSelections,
  withScope,
  withLevel,
  diffPermissions,
  changedModules,
  describeSelection,
  wouldRemoveOwnPermissionManage,
} from "./permissionModel";

/**
 * Mirrors `backend/src/constants/permissionRegistry.constants.js` verbatim.
 * At runtime the real registry arrives from `GET /permissions/registry`; this
 * fixture exists so the level→key expansion can be asserted for every module
 * as it actually is today, including the awkward shapes the pre-build audit
 * turned up (leave has delete but no edit; amc has edit but no delete;
 * tickets has no plain view at all).
 */
const REGISTRY = {
  leads: ["view", "create", "edit", "delete"],
  location: ["view", "view_team", "view_all"],
  permissions: ["manage"],
  users: ["view_team", "view_all"],
  customers: ["view", "create", "edit", "delete"],
  credentials: ["view"],
  projects: ["view", "assign_team"],
  attendance: ["view_team", "view_all", "view_photos", "view_location"],
  leave: ["view", "view_team", "view_all", "approve", "decline", "mark_unapproved_absence", "delete"],
  travelLogs: ["view", "view_team", "view_all"],
  payroll: ["view", "run"],
  tickets: ["create", "assign", "view_all", "view_assigned", "view_own"],
  payments: ["view", "create", "edit", "delete"],
  amc: ["view", "edit"],
  teams: ["manage", "view_team"],
};

const on = (permissions) =>
  Object.entries(permissions || {})
    .filter(([, granted]) => granted === true)
    .map(([action]) => action)
    .sort();

/**
 * Levels are applied through `withLevel`, never by setting `selection.level`
 * directly — the selection carries the real key sets so a stored grant can
 * round-trip untouched, and only an explicit choice re-expands them.
 */
function expand(moduleName, { level }) {
  const descriptor = describeModule(moduleName, REGISTRY);
  const base = permissionsToSelection(descriptor, {});

  return on(selectionToPermissions(descriptor, withLevel(descriptor, base, level)));
}

describe("describeModule — the ladder is per-module, not universal", () => {
  it.each([
    ["leads", ["none", "view", "edit", "full"]],
    ["customers", ["none", "view", "edit", "full"]],
    ["payments", ["none", "view", "edit", "full"]],
    // No delete key, so Full would be identical to Edit — not offered.
    ["amc", ["none", "view", "edit"]],
    // Has delete but no create/edit, so Edit is not offered but Full is.
    ["leave", ["none", "view", "full"]],
    ["location", ["none", "view"]],
    ["travelLogs", ["none", "view"]],
    ["attendance", ["none", "view"]],
    ["users", ["none", "view"]],
    ["credentials", ["none", "view"]],
    ["projects", ["none", "view"]],
    ["payroll", ["none", "view"]],
    // Capability-only — no gradable ladder at all.
    ["permissions", []],
    ["teams", []],
    ["tickets", []],
  ])("offers only the levels %s can actually express", (moduleName, levels) => {
    expect(describeModule(moduleName, REGISTRY).levels).toEqual(levels);
  });

  it("never lets a level expand to a key the module does not have", () => {
    Object.keys(REGISTRY).forEach((moduleName) => {
      const descriptor = describeModule(moduleName, REGISTRY);

      descriptor.levels.forEach((level) => {
        const keys = Object.keys(
          selectionToPermissions(descriptor, withLevel(descriptor, permissionsToSelection(descriptor, {}), level))
        );

        // This is the property that makes the UI saveable at all — the
        // backend validator 400s on any action outside the registry.
        expect(keys.every((key) => REGISTRY[moduleName].includes(key))).toBe(true);
      });
    });
  });

  it("classifies the standalone capability keys the audit identified", () => {
    expect(describeModule("attendance", REGISTRY).capabilities).toEqual([
      "view_photos",
      "view_location",
    ]);
    expect(describeModule("leave", REGISTRY).capabilities).toEqual([
      "approve",
      "decline",
      "mark_unapproved_absence",
    ]);
    expect(describeModule("payroll", REGISTRY).capabilities).toEqual(["run"]);
    expect(describeModule("projects", REGISTRY).capabilities).toEqual(["assign_team"]);
    expect(describeModule("permissions", REGISTRY).capabilities).toEqual(["manage"]);
    expect(describeModule("teams", REGISTRY).capabilities).toEqual(["manage", "view_team"]);
    // All five, since tickets is capability-only.
    expect(describeModule("tickets", REGISTRY).capabilities).toHaveLength(5);
  });

  it("disables scope where it is not a permission key, with a reason", () => {
    ["leads", "customers", "payments", "amc"].forEach((moduleName) => {
      const descriptor = describeModule(moduleName, REGISTRY);

      expect(descriptor.hasScope).toBe(false);
      expect(descriptor.scopeDisabledReason).toMatch(/record ownership/i);
    });

    ["payroll", "permissions"].forEach((moduleName) => {
      expect(describeModule(moduleName, REGISTRY).hasScope).toBe(false);
    });
  });

  it("offers scope only where real scope keys exist", () => {
    expect(describeModule("leave", REGISTRY).scopeTiers).toEqual(["own", "team", "all"]);
    expect(describeModule("location", REGISTRY).scopeTiers).toEqual(["own", "team", "all"]);
    // No `view` key, so no Own tier — Team and All only.
    expect(describeModule("attendance", REGISTRY).scopeTiers).toEqual(["team", "all"]);
    expect(describeModule("users", REGISTRY).scopeTiers).toEqual(["team", "all"]);
  });
});

describe("level → key set expansion", () => {
  it("expands the full CRUD ladder cumulatively", () => {
    expect(expand("leads", { level: "none" })).toEqual([]);
    expect(expand("leads", { level: "view" })).toEqual(["view"]);
    expect(expand("leads", { level: "edit" })).toEqual(["create", "edit", "view"]);
    expect(expand("leads", { level: "full" })).toEqual(["create", "delete", "edit", "view"]);
  });

  it("stops at the rungs amc actually has", () => {
    expect(expand("amc", { level: "view" })).toEqual(["view"]);
    expect(expand("amc", { level: "edit" })).toEqual(["edit", "view"]);
  });

  it("expands leave's Full to view+delete — it has no create or edit key", () => {
    const descriptor = describeModule("leave", REGISTRY);
    const selection = withScope(descriptor, permissionsToSelection(descriptor, {}), "own");

    expect(on(selectionToPermissions(descriptor, withLevel(descriptor, selection, "full")))).toEqual([
      "delete",
      "view",
    ]);
  });

  it("grants nothing at all at None, including scope keys", () => {
    const descriptor = describeModule("leave", REGISTRY);
    const granted = withLevel(
      descriptor,
      withScope(descriptor, permissionsToSelection(descriptor, {}), "all"),
      "view"
    );
    expect(on(selectionToPermissions(descriptor, granted))).not.toEqual([]);

    expect(on(selectionToPermissions(descriptor, withLevel(descriptor, granted, "none")))).toEqual([]);
  });
});

describe("scope → key variants", () => {
  it("maps Own/Team/All onto view / view_team / view_all cumulatively", () => {
    const descriptor = describeModule("leave", REGISTRY);
    const base = withLevel(descriptor, permissionsToSelection(descriptor, {}), "view");

    expect(on(selectionToPermissions(descriptor, withScope(descriptor, base, "own")))).toEqual([
      "view",
    ]);
    expect(on(selectionToPermissions(descriptor, withScope(descriptor, base, "team")))).toEqual([
      "view",
      "view_team",
    ]);
    expect(on(selectionToPermissions(descriptor, withScope(descriptor, base, "all")))).toEqual([
      "view",
      "view_all",
      "view_team",
    ]);
  });

  it("skips the missing Own tier on attendance", () => {
    const descriptor = describeModule("attendance", REGISTRY);
    const base = withLevel(descriptor, permissionsToSelection(descriptor, {}), "view");

    expect(on(selectionToPermissions(descriptor, withScope(descriptor, base, "team")))).toEqual([
      "view_team",
    ]);
    expect(on(selectionToPermissions(descriptor, withScope(descriptor, base, "all")))).toEqual([
      "view_all",
      "view_team",
    ]);
  });

  it("never invents a scope key format", () => {
    Object.keys(REGISTRY).forEach((moduleName) => {
      const descriptor = describeModule(moduleName, REGISTRY);

      descriptor.scopeTiers.forEach((tier) => {
        const keys = Object.keys(
          selectionToPermissions(
            descriptor,
            withScope(descriptor, withLevel(descriptor, permissionsToSelection(descriptor, {}), "view"), tier)
          )
        );

        expect(keys.every((key) => REGISTRY[moduleName].includes(key))).toBe(true);
      });
    });
  });

  it("moving off None grants the narrowest tier rather than nothing", () => {
    const descriptor = describeModule("location", REGISTRY);
    const selection = withLevel(descriptor, permissionsToSelection(descriptor, {}), "view");

    expect(on(selectionToPermissions(descriptor, selection))).toEqual(["view"]);
  });
});

/**
 * The audit found real stored grants that a naive model would rewrite. These
 * assert the exact production values round-trip untouched — loading a row and
 * saving it without touching it must be a no-op.
 */
describe("round-tripping the grants that actually exist in production", () => {
  it.each([
    [
      "manager.leave (delete with no edit key)",
      "leave",
      {
        view: true,
        view_team: true,
        approve: true,
        decline: true,
        mark_unapproved_absence: true,
        delete: true,
      },
    ],
    ["manager.tickets (create with no view key)", "tickets", { create: true, assign: true, view_all: true }],
    ["customer.tickets", "tickets", { create: true, view_own: true }],
    ["manager.location (view_team with NO view)", "location", { view_team: true }],
    ["manager.leads (full ladder)", "leads", { view: true, create: true, edit: true, delete: true }],
    ["employee.tickets", "tickets", { view_assigned: true }],
    ["manager.teams", "teams", { view_team: true }],
    ["employee.payroll", "payroll", { view: true }],
    ["manager.attendance", "attendance", { view_team: true }],
  ])("%s survives a load/save cycle unchanged", (_label, moduleName, stored) => {
    const descriptor = describeModule(moduleName, REGISTRY);
    const selection = permissionsToSelection(descriptor, stored);

    expect(on(selectionToPermissions(descriptor, selection))).toEqual(on(stored));
  });

  it("does NOT silently widen manager.location by adding the Own key", () => {
    // The trap: `view_team` is stored without `view`. A cumulative expansion
    // on LOAD would add `location.view` — a grant nobody asked for, appearing
    // on a row that was only looked at.
    const descriptor = describeModule("location", REGISTRY);
    const result = selectionToPermissions(descriptor, permissionsToSelection(descriptor, { view_team: true }));

    expect(result.view).toBe(false);
    expect(result.view_team).toBe(true);
  });

  it("expands cumulatively once the user actually picks a tier", () => {
    const descriptor = describeModule("location", REGISTRY);
    const loaded = permissionsToSelection(descriptor, { view_team: true });
    const afterChoice = withScope(descriptor, loaded, "team");

    expect(on(selectionToPermissions(descriptor, afterChoice))).toEqual(["view", "view_team"]);
  });
});

describe("capability flags", () => {
  it("round-trip independently of the level", () => {
    const descriptor = describeModule("attendance", REGISTRY);
    const stored = { view_team: true, view_photos: true, view_location: false };
    const selection = permissionsToSelection(descriptor, stored);

    expect(selection.capabilities).toEqual({ view_photos: true, view_location: false });
    expect(on(selectionToPermissions(descriptor, selection))).toEqual(["view_photos", "view_team"]);
  });

  it("can be granted with the level at None", () => {
    const descriptor = describeModule("leave", REGISTRY);
    const selection = {
      ...withLevel(descriptor, permissionsToSelection(descriptor, {}), "none"),
      capabilities: { approve: true, decline: false, mark_unapproved_absence: false },
    };

    expect(on(selectionToPermissions(descriptor, selection))).toEqual(["approve"]);
  });

  it("carries every key for a capability-only module", () => {
    const descriptor = describeModule("tickets", REGISTRY);
    const selection = permissionsToSelection(descriptor, { create: true, view_own: true });

    expect(on(selectionToPermissions(descriptor, selection))).toEqual(["create", "view_own"]);
  });
});

describe("diffing", () => {
  const template = { leads: { view: true, create: false } };

  it("reports the differing keys and modules", () => {
    const next = { leads: { view: true, create: true } };

    expect(diffPermissions(REGISTRY, template, next)).toEqual(["leads.create"]);
    expect([...changedModules(REGISTRY, template, next)]).toEqual(["leads"]);
  });

  it("treats missing and false identically — an absent key is not a change", () => {
    expect(diffPermissions(REGISTRY, { leads: { view: true } }, { leads: { view: true, create: false } })).toEqual([]);
  });

  it("reports nothing for an untouched full round-trip of every module", () => {
    const stored = {
      leave: { view: true, view_team: true, delete: true, approve: true },
      location: { view_team: true },
      tickets: { create: true, view_all: true },
      amc: { view: true, edit: true },
    };

    const rebuilt = selectionsToPermissions(REGISTRY, buildSelections(REGISTRY, stored));

    expect(diffPermissions(REGISTRY, stored, rebuilt)).toEqual([]);
  });
});

describe("describeSelection — the 'was ...' drift note", () => {
  it("reads as level · scope", () => {
    const descriptor = describeModule("leave", REGISTRY);

    expect(describeSelection(descriptor, permissionsToSelection(descriptor, { view: true, view_team: true })))
      .toBe("View · Team");
  });

  it("counts capability flags separately", () => {
    const descriptor = describeModule("attendance", REGISTRY);
    const selection = permissionsToSelection(descriptor, { view_team: true, view_photos: true });

    expect(describeSelection(descriptor, selection)).toBe("View · Team · +1");
  });

  it("lists the flags by name for a capability-only module", () => {
    const descriptor = describeModule("permissions", REGISTRY);

    expect(describeSelection(descriptor, permissionsToSelection(descriptor, { manage: true }))).toBe(
      "Manage permissions"
    );
    expect(describeSelection(descriptor, permissionsToSelection(descriptor, {}))).toBe("None");
  });
});

describe("self-lockout guard", () => {
  it("fires when removing your OWN permissions.manage", () => {
    expect(
      wouldRemoveOwnPermissionManage({
        isEditingSelf: true,
        current: { permissions: { manage: true } },
        next: { permissions: { manage: false } },
      })
    ).toBe(true);
  });

  it("does not fire when editing someone else", () => {
    expect(
      wouldRemoveOwnPermissionManage({
        isEditingSelf: false,
        current: { permissions: { manage: true } },
        next: { permissions: { manage: false } },
      })
    ).toBe(false);
  });

  it("does not fire when keeping or adding the grant", () => {
    expect(
      wouldRemoveOwnPermissionManage({
        isEditingSelf: true,
        current: { permissions: { manage: true } },
        next: { permissions: { manage: true } },
      })
    ).toBe(false);
    expect(
      wouldRemoveOwnPermissionManage({
        isEditingSelf: true,
        current: { permissions: { manage: false } },
        next: { permissions: { manage: true } },
      })
    ).toBe(false);
  });
});
