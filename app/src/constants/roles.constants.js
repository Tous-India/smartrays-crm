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

/** How a role reads on screen (2026-10-23) — "sales associate", not "sales_associate". */
export const ROLE_LABELS = {
  [ROLES.ADMIN]: "admin",
  [ROLES.MANAGER]: "manager",
  [ROLES.SALES_ASSOCIATE]: "sales associate",
  [ROLES.EMPLOYEE]: "employee",
  [ROLES.CUSTOMER]: "customer",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role ?? "";
}

/**
 * Roles the app serves: the field roles (sales associates too, 2026-10-23),
 * and admin (2026-10-23) for live tracking and complaints.
 */
export const APP_ROLES = [ROLES.EMPLOYEE, ROLES.SALES_ASSOCIATE, ROLES.MANAGER, ROLES.ADMIN];
