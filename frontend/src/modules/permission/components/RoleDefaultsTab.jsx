import { useEffect, useState } from "react";
import { Select, Alert, Spin, message } from "antd";
import dayjs from "dayjs";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { USER_ROLES, USER_ROLE_LABELS } from "../../user/constants/user.constants";
import { getRoleTemplate, updateRoleTemplate } from "../api/permissionApi";
import PermissionMatrix from "./PermissionMatrix";

/**
 * Role Defaults — edits the template new accounts of a given role are
 * seeded with at creation time (`permission.service.js#getTemplatePermissionsForRole`).
 * Never retroactive: editing a template only changes what FUTURE accounts
 * of that role get, existing users keep whatever they already have — the
 * warning banner below states this explicitly since it's easy to assume
 * otherwise.
 */
function RoleDefaultsTab({ registry }) {
  const [selectedRole, setSelectedRole] = useState(USER_ROLES[0]);
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
    <div>
      <Alert
        type="warning"
        showIcon
        className="mb-4"
        message="Changes here only affect users created after this save — existing users' permissions are not retroactively changed."
      />

      <Select
        className="mb-4"
        style={{ width: 240 }}
        value={selectedRole}
        onChange={setSelectedRole}
        options={USER_ROLES.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] }))}
      />

      {template && (
        <div className="mb-3 text-sm text-gray-500">
          {template.updatedBy
            ? `Last updated by ${userNameById.get(template.updatedBy) || "Unknown user"} on ${dayjs(
                template.updatedAt
              ).format("DD MMM YYYY, h:mm A")}`
            : "Never edited — still the initial default template."}
        </div>
      )}

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
