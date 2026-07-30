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
  TICKET_DETAIL: "/tickets/:id",
  PAYMENTS: "/payments",
  AMC: "/amc",
  REPORTS: "/reports",
  // Bare `/settings` redirects to `SETTINGS_USERS` — the sidebar's single
  // flat "Settings" nav item links here; the two concrete routes below are
  // rendered as tabs on the same `SettingsPage`, not separate pages.
  SETTINGS: "/settings",
  SETTINGS_PERMISSIONS: "/settings/permissions",
  SETTINGS_USERS: "/settings/users",
  SETTINGS_TEAMS: "/settings/teams",
  PORTAL: "/portal",
};
