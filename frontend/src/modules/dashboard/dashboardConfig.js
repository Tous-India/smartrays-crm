import LeadsPipelineWidget from "./widgets/LeadsPipelineWidget";
import LeadsFollowUpWidget from "./widgets/LeadsFollowUpWidget";
import LeadsHotWidget from "./widgets/LeadsHotWidget";
import CustomersOverviewWidget from "./widgets/CustomersOverviewWidget";
import CustomersRecentWidget from "./widgets/CustomersRecentWidget";

/**
 * Declarative widget catalog — a role → ordered widget-component list, not a
 * runtime plugin/registry. There's no precedent for a registration mechanism
 * anywhere else in this codebase (the permission system itself is a static
 * constants object, `PERMISSION_REGISTRY`, not something modules register
 * into at runtime), and a full registry would be real complexity for what's
 * currently 2 modules' worth of widgets.
 *
 * This list only decides which widgets are CANDIDATES for a role — each
 * widget still independently re-checks its own real permission via
 * `usePermission` before rendering anything (see each widget file's own
 * comment). That's deliberate defense in depth: a specific user's
 * permissions can be overridden away from their role's template defaults at
 * any time (§7.12's per-user override), so the config alone picking
 * candidates by role can't be trusted as the only gate — same principle
 * already applied everywhere else permission-gating shows up in this app
 * (`PermissionGate`/`usePermission`, `MainLayout`'s nav filtering).
 *
 * **Adding a future module's widget (Attendance, Payroll, Leave, ...):**
 * 1. Write the widget component under `widgets/` — self-contained, fetches
 *    its own data via that module's existing API functions (reuse the same
 *    scoped fetch its list page already calls — never a new unscoped
 *    query), renders its own loading/error/empty states, and gates itself
 *    internally with `usePermission` exactly like every widget here does.
 * 2. Import it above.
 * 3. Add it to whichever role arrays below should see it as a candidate.
 *
 * No other file needs to change — `DashboardPage.jsx` just renders whatever
 * `getDashboardWidgetsForRole` returns. See `frontend/README.md`'s Dashboard
 * section for the full walkthrough.
 */
export const DASHBOARD_WIDGETS_BY_ROLE = {
  admin: [
    LeadsPipelineWidget,
    LeadsFollowUpWidget,
    LeadsHotWidget,
    CustomersOverviewWidget,
    CustomersRecentWidget,
  ],
  manager: [
    LeadsPipelineWidget,
    LeadsFollowUpWidget,
    LeadsHotWidget,
    CustomersOverviewWidget,
    CustomersRecentWidget,
  ],
  // Sales Associates hold full "own" CRUD on both Leads and Customers by
  // default (§5's permission matrix) — their dashboard candidate list
  // mirrors that, own-scoped automatically since every widget above reuses
  // each module's own server-side-scoped fetch.
  sales_associate: [
    LeadsPipelineWidget,
    LeadsFollowUpWidget,
    LeadsHotWidget,
    CustomersOverviewWidget,
    CustomersRecentWidget,
  ],
  // Employee has no `leads`/`customers` grant at all by default (§5: "–" for
  // both) — no Leads/Customers widget candidates yet. Gets its own widgets
  // once an Attendance/Leave/Payroll dashboard widget is built (not in this
  // task's scope, see `.context/final-plan.md` §7.13/§7.20).
  employee: [],
  // The Customer Portal role never renders this page at all (`PortalLayout`
  // + `PortalHomePage` instead, see `RootRedirect`) — kept here for
  // completeness/documentation, not because it's reachable today.
  customer: [],
};

export function getDashboardWidgetsForRole(role) {
  return DASHBOARD_WIDGETS_BY_ROLE[role] || [];
}
