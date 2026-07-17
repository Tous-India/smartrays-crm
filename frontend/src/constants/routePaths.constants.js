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
  TASKS: "/tasks",
  ATTENDANCE: "/attendance",
  ATTENDANCE_TEAM: "/attendance/team",
  LEAVE: "/leave",
  PAYROLL: "/payroll",
  PAYSLIP_DETAIL: "/payroll/:id/payslip",
  TRAVEL_LOGS: "/travel-logs",
  TICKETS: "/tickets",
  TICKET_DETAIL: "/tickets/:id",
  PAYMENTS: "/payments",
  AMC: "/amc",
  REPORTS: "/reports",
  SETTINGS_PERMISSIONS: "/settings/permissions",
  SETTINGS_USERS: "/settings/users",
  PORTAL: "/portal",
};
