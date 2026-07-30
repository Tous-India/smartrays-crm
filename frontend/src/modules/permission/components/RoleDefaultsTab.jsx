import { useEffect, useState } from "react";
import { Select, Alert, Spin, message } from "antd";
import dayjs from "dayjs";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { USER_ROLES, ROLE_PICKER_LABELS } from "../../user/constants/user.constants";
import { getRoleTemplate, updateRoleTemplate } from "../api/permissionApi";
import PermissionMatrix from "./PermissionMatrix";

// "Admin" is excluded (2026-07-30 fix) — admin bypasses every permission
// check in code (`can()`'s own admin-bypass, §4.1), so its template is never
// actually consulted for anything; editing an "Admin template" here would
// be meaningless. Labels come from the shared `ROLE_PICKER_LABELS`
// (user.constants.js, the same constant `UserFormModal.jsx`'s New User
// form role picker already uses) so "Executive" isn't a second hardcoded
// label for the `employee` value.
const SELECTABLE_ROLES = USER_ROLES.filter((role) => role !== "admin");

/**
 * Role Defaults — edits the template new accounts of a given role are
 * seeded with at creation time (`permission.service.js#getTemplatePermissionsForRole`).
 * Never retroactive: editing a template only changes what FUTURE accounts
 * of that role get, existing users keep whatever they already have — the
 * warning banner below states this explicitly since it's easy to assume
 * otherwise.
 */
function RoleDefaultsTab({ registry }) {
  const [selectedRole, setSelectedRole] = useState(SELECTABLE_ROLES[0]);
  const [template, setTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { users } = useUserDirectory();

  const userNameById = new Map(users.map((user) => [user._id, user.name]));

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    getRoleTemplate(selectedRole).then((response) => {
      if (isMounted) {
        setTemplate(response.data.data);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedRole]);

  async function handleSave(permissions) {
    setIsSaving(true);

    try {
      const response = await updateRoleTemplate(selectedRole, permissions);
      setTemplate(response.data.data);
      message.success("Role template updated");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Alert
        type="warning"
        showIcon
        message="Changes here only affect users created after this save — existing users' permissions are not retroactively changed."
      />

      <div className="flex flex-col gap-2">
        <Select
          style={{ width: 240 }}
          value={selectedRole}
          onChange={setSelectedRole}
          options={SELECTABLE_ROLES.map((role) => ({ value: role, label: ROLE_PICKER_LABELS[role] }))}
        />

        {template && (
          <div className="text-sm text-gray-500">
            {template.updatedBy
              ? `Last updated by ${userNameById.get(template.updatedBy) || "Unknown user"} on ${dayjs(
                  template.updatedAt
                ).format("DD MMM YYYY, h:mm A")}`
              : "Never edited — still the initial default template."}
          </div>
        )}
      </div>

      {isLoading || !template ? (
        <Spin />
      ) : (
        <PermissionMatrix
          registry={registry}
          value={template.permissions}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}

export default RoleDefaultsTab;
