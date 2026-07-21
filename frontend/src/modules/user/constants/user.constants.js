// Mirrors backend/src/modules/user/user.model.js's USER_ROLES exactly — kept
// as a plain constant here (no shared endpoint returns this list) rather than
// an extra round trip just to fetch a fixed 5-value enum.
export const USER_ROLES = ["admin", "manager", "sales_associate", "employee", "customer"];

export const USER_ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager",
  sales_associate: "Sales Associate",
  employee: "Employee",
  customer: "Customer",
};
