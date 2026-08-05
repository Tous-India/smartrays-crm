/**
 * Every top-level route path in the app, in one place, per §8 of
 * `.context/final-plan.md`. Import from here instead of hardcoding path
 * strings so a future path rename only touches one file.
 */
export const ROUTE_PATHS = {
  ROOT: "/",
  LOGIN: "/login",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  DASHBOARD: "/dashboard",
  LEADS: "/leads",
  LEADS_BOARD: "/leads/board",
  LEAD_DETAIL: "/leads/:id",
  CUSTOMERS: "/customers",
  CUSTOMER_DETAIL: "/customers/:id",
  PROJECT_DETAIL: "/projects/:id",
  ATTENDANCE: "/attendance",
  ATTENDANCE_TEAM: "/attendance/team",
  LEAVE: "/leave",
  LOCATION: "/location",
  PAYROLL: "/payroll",
  PAYSLIP_DETAIL: "/payroll/:id/payslip",
  TRAVEL_LOGS: "/travel-logs",
  TICKETS: "/tickets",
  // The standalone /amc PAGE was retired 2026-08-05 (AMC now lives on the
  // Customer Detail page) — this constant deliberately outlives its route
  // because `AmcRenewalsDueWidget` still references it, and that file has
  // uncommitted work from a concurrent session. Its "View all AMC records"
  // link needs repointing at /customers as a follow-up; see frontend/README.
  AMC: "/amc",
  TICKET_DETAIL: "/tickets/:id",
  PAYMENTS: "/payments",
  REPORTS: "/reports",
  // Bare `/settings` redirects to `SETTINGS_USERS` — the sidebar's single
  // flat "Settings" nav item links here; the two concrete routes below are
  // rendered as tabs on the same `SettingsPage`, not separate pages.
  SETTINGS: "/settings",
  SETTINGS_PERMISSIONS: "/settings/permissions",
  SETTINGS_USERS: "/settings/users",
  SETTINGS_TEAMS: "/settings/teams",
  // A real standalone route (not a SettingsPage tab, unlike the three
  // above) — the first dedicated User Detail view (§7.32), consolidating
  // data already scattered across Attendance/Leave/Teams/Leads/Payroll/
  // Permissions onto one page.
  USER_DETAIL: "/settings/users/:id",
  PORTAL: "/portal",
};
