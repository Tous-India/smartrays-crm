/**
 * Role names exactly as the backend stores them (backend USER_ROLES). The
 * app never decides what a role MAY do — that is `GET /users/me/permissions`
 * and the server's own gates — it only decides which navigator to show.
 */
export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  SALES_ASSOCIATE: "sales_associate",
  EMPLOYEE: "employee",
  CUSTOMER: "customer",
};

/** Roles the app serves: the field roles, and admin (2026-10-23) for live tracking and complaints. */
export const APP_ROLES = [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.ADMIN];
