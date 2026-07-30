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

// "Executive" is a DISPLAY LABEL ONLY for the existing `employee` role value
// (no schema/enum change — mirrors the already-resolved Executive=Employee
// decision, `user.model.js`'s own comment, `.context/final-plan.md` §11.1).
// Scoped to admin-facing role-PICKER dropdowns only (the New User form's
// Role select, the Permissions Role Defaults tab's role select) — NOT the
// roster table's Role column or anywhere else, which still shows
// `USER_ROLE_LABELS`'s plain "Employee". The one shared constant every such
// picker imports, so this mapping is never duplicated ad hoc per picker.
export const ROLE_PICKER_LABELS = { ...USER_ROLE_LABELS, employee: "Executive" };
