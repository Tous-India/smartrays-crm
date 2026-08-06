/**
 * Translates between the flat `{ module: { action: boolean } }` grants the
 * server stores and the level/scope model the matrix UI presents (§7.41,
 * 2026-08-06).
 *
 * **The ladder is per-module, not universal.** This is the single most
 * important thing in this file, and it comes straight out of the audit that
 * preceded the rewrite:
 *
 * - `leave` has `view` and `delete` but NO `create`/`edit`.
 * - `amc` has `view` and `edit` but NO `create`/`delete`.
 * - `tickets` has no plain `view` at all.
 *
 * A universal view→create→edit→delete ladder would emit keys that don't exist
 * for those modules, and `permission.validation.js#validatePermissionsBody`
 * rejects unknown actions with a 400 — so a universal ladder wouldn't merely
 * mis-render those rows, it would make them unsaveable. Every level is
 * therefore expanded against the module's OWN registry entry.
 *
 * The server remains the source of truth: everything here is a convenience
 * over the same flat keys, and nothing this file does can widen a grant the
 * backend validator wouldn't already accept.
 */

/** Rung order. A module's ladder is this list intersected with its registry. */
const LADDER_ORDER = ["view", "create", "edit", "delete"];

/** Scope tier → the flat key it maps to. Never invents a new key format. */
const SCOPE_KEY_BY_TIER = { own: "view", team: "view_team", all: "view_all" };

export const SCOPE_TIERS = ["own", "team", "all"];
export const SCOPE_LABELS = { own: "Own", team: "Team", all: "All" };

export const LEVELS = ["none", "view", "edit", "full"];
export const LEVEL_LABELS = { none: "None", view: "View", edit: "Edit", full: "Full" };

/**
 * Modules whose keys are ALL standalone capabilities — no gradable ladder.
 *
 * `tickets` is here on a deliberate call from the audit: its view tiers are
 * `view_own`/`view_assigned`/`view_all`, and the middle one is "assigned to
 * me", not "my team". Forcing it into the Own/Team/All control would relabel
 * one module's scope differently from every other, so all five of its keys
 * render as chips instead and nothing is silently coerced.
 */
const CAPABILITY_ONLY_MODULES = new Set(["permissions", "teams", "tickets"]);

/**
 * Modules where scope is real behaviour but is NOT stored as a permission
 * key — `lead.service.js#resolveVisibilityFilter` and its equivalents branch
 * on `requestingUser.role` and record ownership instead. The scope control
 * renders inert on these rows with this explanation, rather than offering a
 * choice that has nowhere to be saved.
 */
const OWNERSHIP_SCOPED_MODULES = new Set(["leads", "customers", "payments", "amc"]);

const OWNERSHIP_SCOPE_REASON =
  "Scope for this module follows record ownership and is set by role, not by permission.";

const NO_SCOPE_REASON = "This module has no scoped access tiers.";

export const MODULE_LABELS = {
  leads: "Leads",
  location: "Live Location",
  permissions: "Permissions",
  users: "Users",
  customers: "Customers",
  credentials: "Credentials Vault",
  projects: "Projects",
  attendance: "Attendance",
  leave: "Leave",
  travelLogs: "Travel Logs",
  payroll: "Payroll",
  tickets: "Support Tickets",
  payments: "Payments",
  amc: "AMC Contracts",
  teams: "Teams",
};

/** Human labels for the standalone capability chips. */
export const CAPABILITY_LABELS = {
  "permissions.manage": "Manage permissions",
  "teams.manage": "Manage teams",
  "teams.view_team": "View own team",
  "projects.assign_team": "Assign project team",
  "attendance.view_photos": "See check-in photos",
  "attendance.view_location": "See check-in location",
  "leave.approve": "Approve leave",
  "leave.decline": "Decline leave",
  "leave.mark_unapproved_absence": "Mark unapproved absence",
  "payroll.run": "Run payroll (and see everyone's)",
  "tickets.create": "Raise tickets",
  "tickets.assign": "Assign tickets",
  "tickets.view_own": "See own tickets",
  "tickets.view_assigned": "See assigned tickets",
  "tickets.view_all": "See all tickets",
};

export function labelForCapability(moduleName, action) {
  return CAPABILITY_LABELS[`${moduleName}.${action}`] || action.replace(/_/g, " ");
}

export function labelForModule(moduleName) {
  return MODULE_LABELS[moduleName] || moduleName;
}

/**
 * Describes one module: which levels it can actually express, which scope
 * tiers exist for it, and which keys are standalone capabilities.
 *
 * Derived from the registry rather than hardcoded, so adding an action to an
 * existing module changes what a level maps to WITHOUT changing the number of
 * controls in the row — which is exactly the layout guarantee this rewrite
 * is built around.
 */
export function describeModule(moduleName, registry) {
  const actions = registry[moduleName] || [];
  const capabilityOnly = CAPABILITY_ONLY_MODULES.has(moduleName);

  const scopeTiers = capabilityOnly
    ? []
    : SCOPE_TIERS.filter((tier) => actions.includes(SCOPE_KEY_BY_TIER[tier]));

  // A single tier is not a choice — `teams` would otherwise render a
  // one-option scope control. Treat fewer than two tiers as "no scope".
  const hasScope = scopeTiers.length >= 2;

  // When scope tiers exist, the plain `view` key IS the Own tier rather than
  // a separate ladder rung — `GET /leave?scope=own` checks exactly that key.
  // Counting it twice would let the Level control and the Scope control both
  // claim ownership of one key and fight over it.
  const ladderCandidates = hasScope ? LADDER_ORDER.filter((a) => a !== "view") : LADDER_ORDER;
  const ladder = capabilityOnly ? [] : ladderCandidates.filter((action) => actions.includes(action));

  const consumed = new Set([
    ...ladder,
    ...(hasScope ? scopeTiers.map((tier) => SCOPE_KEY_BY_TIER[tier]) : []),
  ]);
  const capabilities = actions.filter((action) => !consumed.has(action));

  return {
    module: moduleName,
    actions,
    ladder,
    capabilities,
    hasScope,
    scopeTiers,
    // Only levels that produce a DISTINCT key set are offered. `amc` has
    // view+edit and no delete, so its Edit and Full would be identical —
    // offering both would present a choice that changes nothing.
    levels: availableLevels({ capabilityOnly, hasScope, ladder, actions }),
    scopeDisabledReason: hasScope
      ? null
      : OWNERSHIP_SCOPED_MODULES.has(moduleName)
        ? OWNERSHIP_SCOPE_REASON
        : NO_SCOPE_REASON,
    capabilityOnly,
  };
}

function availableLevels({ capabilityOnly, hasScope, ladder, actions }) {
  if (capabilityOnly) {
    return [];
  }

  const levels = ["none"];

  // "View" needs something to grant: either a plain `view` rung or a scope
  // tier key standing in for it.
  if (hasScope || actions.includes("view")) {
    levels.push("view");
  }

  const hasEditRung = ladder.includes("create") || ladder.includes("edit");
  const hasFullRung = ladder.includes("delete");

  if (hasEditRung) {
    levels.push("edit");
  }

  if (hasFullRung) {
    levels.push("full");
  }

  // A module whose only rung above view is `edit` (amc) would otherwise offer
  // Edit and Full as the same key set.
  return levels;
}

/**
 * The ladder keys a level grants, for this module specifically. Cumulative:
 * Edit implies View, Full implies Edit.
 */
function ladderKeysForLevel(descriptor, level) {
  const { ladder } = descriptor;

  const granted =
    level === "none"
      ? []
      : level === "view"
        ? ladder.filter((action) => action === "view")
        : level === "edit"
          ? ladder.filter((action) => action !== "delete")
          : [...ladder];

  return Object.fromEntries(ladder.map((action) => [action, granted.includes(action)]));
}

/**
 * Cumulative key set for a scope tier: the chosen tier plus every narrower
 * one. Applied ONLY on an explicit choice — see `withScope`.
 */
export function cumulativeScopeKeys(descriptor, tier) {
  const index = descriptor.scopeTiers.indexOf(tier);
  const chosen = descriptor.scopeTiers.slice(0, index < 0 ? 1 : index + 1);

  return Object.fromEntries(
    descriptor.scopeTiers.map((t) => [SCOPE_KEY_BY_TIER[t], chosen.includes(t)])
  );
}

/**
 * Applies a scope choice, expanding cumulatively.
 *
 * Expansion happens HERE — on an explicit user action — and deliberately not
 * on load. `manager.location` is stored as `{ view_team: true }` with no
 * `view`; expanding that cumulatively at load time and saving it back would
 * silently add `location.view`, a grant nobody asked for appearing on a row
 * that was only looked at. The same trap exists on the ladder
 * (`{ view, create }` with no `edit`), which is why BOTH key sets are carried
 * verbatim on the selection and only rewritten by `withScope`/`withLevel`.
 */
export function withScope(descriptor, selection, tier) {
  return { ...selection, scope: tier, scopeKeys: cumulativeScopeKeys(descriptor, tier) };
}

/** Applies a level choice, expanding the ladder (and scope) cumulatively. */
export function withLevel(descriptor, selection, level) {
  const next = {
    ...selection,
    level,
    ladderKeys: ladderKeysForLevel(descriptor, level),
  };

  if (!descriptor.hasScope) {
    return next;
  }

  if (level === "none") {
    // Nothing is granted at None, scope keys included.
    return {
      ...next,
      scopeKeys: Object.fromEntries(Object.keys(next.scopeKeys || {}).map((key) => [key, false])),
    };
  }

  // Moving off None must grant something, or the row would read "View · Own"
  // while storing nothing at all.
  const hasAnyScopeKey = Object.values(next.scopeKeys || {}).some(Boolean);

  return hasAnyScopeKey ? next : withScope(descriptor, next, next.scope || descriptor.scopeTiers[0]);
}

/**
 * Expands a selection into the flat key object the server stores. Every key
 * the module has appears explicitly, true or false — an explicit `false` must
 * stay visible (the `minimize: false` reasoning on both models), and an
 * omitted key would read as "unchanged" to a full replace it isn't.
 */
export function selectionToPermissions(descriptor, selection) {
  const { ladderKeys = {}, scopeKeys = {}, capabilities = {} } = selection || {};
  const granted = new Set();

  [ladderKeys, scopeKeys, capabilities].forEach((group) => {
    Object.entries(group).forEach(([action, isOn]) => {
      if (isOn) {
        granted.add(action);
      }
    });
  });

  return Object.fromEntries(descriptor.actions.map((action) => [action, granted.has(action)]));
}

/**
 * Reads a stored key set back into level + scope + capabilities.
 *
 * Deliberately tolerant: the audit found real grants that don't sit on a
 * clean rung (manager's `leave` holds `delete` alongside `view`, with no
 * `edit` key existing at all). This reports the HIGHEST level whose keys are
 * present, and carries the raw key sets alongside, so any grant round-trips
 * byte-for-byte instead of being quietly rewritten on load.
 */
export function permissionsToSelection(descriptor, permissions) {
  const actions = permissions || {};
  const isOn = (action) => actions[action] === true;

  const capabilities = Object.fromEntries(
    descriptor.capabilities.map((action) => [action, isOn(action)])
  );

  if (descriptor.capabilityOnly) {
    return { level: "none", scope: null, ladderKeys: {}, scopeKeys: {}, capabilities };
  }

  // Both carried verbatim, never recomputed — see `withScope`.
  const ladderKeys = Object.fromEntries(descriptor.ladder.map((action) => [action, isOn(action)]));
  const scopeKeys = Object.fromEntries(
    descriptor.scopeTiers.map((tier) => [SCOPE_KEY_BY_TIER[tier], isOn(SCOPE_KEY_BY_TIER[tier])])
  );

  const scope = descriptor.hasScope
    ? [...descriptor.scopeTiers].reverse().find((tier) => isOn(SCOPE_KEY_BY_TIER[tier])) || null
    : null;

  const hasAnyView = descriptor.hasScope ? Boolean(scope) : isOn("view");
  const ladderOn = descriptor.ladder.filter(isOn);

  let level = "none";

  if (hasAnyView || ladderOn.length > 0) {
    level = "view";

    if (descriptor.levels.includes("edit") && (isOn("create") || isOn("edit"))) {
      level = "edit";
    }

    if (descriptor.levels.includes("full") && isOn("delete")) {
      level = "full";
    }
  }

  return {
    level,
    // A scoped module with no tier granted defaults to the narrowest, so
    // moving the level off None doesn't leave scope unset.
    scope: scope || (descriptor.hasScope ? descriptor.scopeTiers[0] : null),
    ladderKeys,
    scopeKeys,
    capabilities,
  };
}

/** Human summary of a selection, for the "was View · Team" drift note. */
export function describeSelection(descriptor, selection) {
  if (descriptor.capabilityOnly) {
    const on = descriptor.capabilities.filter((action) => selection.capabilities?.[action]);
    return on.length === 0
      ? "None"
      : on.map((action) => labelForCapability(descriptor.module, action)).join(", ");
  }

  const parts = [LEVEL_LABELS[selection.level]];

  if (selection.level !== "none" && descriptor.hasScope && selection.scope) {
    parts.push(SCOPE_LABELS[selection.scope]);
  }

  const on = descriptor.capabilities.filter((action) => selection.capabilities?.[action]);

  if (on.length > 0) {
    parts.push(`+${on.length}`);
  }

  return parts.join(" · ");
}

/**
 * Builds the whole editable state from a stored permissions object, one entry
 * per registry module. Modules absent from storage come back as "none",
 * which is what `can()` treats them as anyway.
 */
export function buildSelections(registry, permissions) {
  return Object.fromEntries(
    Object.keys(registry).map((moduleName) => [
      moduleName,
      permissionsToSelection(describeModule(moduleName, registry), permissions?.[moduleName]),
    ])
  );
}

/** Collapses the editable state back into a flat permissions object. */
export function selectionsToPermissions(registry, selections) {
  return Object.fromEntries(
    Object.keys(registry).map((moduleName) => [
      moduleName,
      selectionToPermissions(describeModule(moduleName, registry), selections[moduleName]),
    ])
  );
}

/**
 * Compares two flat permission objects, returning `module.action` strings for
 * every key whose granted-ness differs. Used both for unsaved-change marking
 * and for template-divergence marking on the override screen — the same
 * comparison, two different baselines.
 */
export function diffPermissions(registry, left, right) {
  const differing = [];

  Object.entries(registry).forEach(([moduleName, actions]) => {
    actions.forEach((action) => {
      const l = left?.[moduleName]?.[action] === true;
      const r = right?.[moduleName]?.[action] === true;

      if (l !== r) {
        differing.push(`${moduleName}.${action}`);
      }
    });
  });

  return differing;
}

/** Which modules differ, for per-row marking. */
export function changedModules(registry, left, right) {
  return new Set(diffPermissions(registry, left, right).map((key) => key.split(".")[0]));
}

/**
 * True when this save would strip the acting admin's own `permissions.manage`
 * — the one change that can lock the last admin out of the permission system
 * entirely. The caller confirms explicitly before proceeding.
 *
 * Only meaningful when editing your OWN grants: a role template edit or
 * another user's overrides can't remove your own access.
 */
export function wouldRemoveOwnPermissionManage({ isEditingSelf, current, next }) {
  if (!isEditingSelf) {
    return false;
  }

  return current?.permissions?.manage === true && next?.permissions?.manage !== true;
}
