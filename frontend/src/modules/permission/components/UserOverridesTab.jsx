import { useEffect, useState } from "react";
import { Select, Button, Popconfirm, Spin, App } from "antd";
import useUserDirectory from "../../../hooks/useUserDirectory";
import { USER_ROLE_LABELS } from "../../user/constants/user.constants";
import { getUserPermissions, updateUserPermissions, resetUserPermissions } from "../api/permissionApi";
import PermissionMatrix from "./PermissionMatrix";

/**
 * User Overrides — edits one specific user's actual `permissions` object
 * directly (`User.permissions`, independent of their role's template once
 * set). The user picker reuses `useUserDirectory` (`GET /users/dropdown`)
 * with a client-side `showSearch` filter — this app's dominant "assign to"
 * picker pattern (Team's head/member pickers, Lead's owner picker,
 * Convert-to-Customer's project manager picker), not the debounced
 * server-side search Payments' Customer picker uses. That pattern exists
 * there specifically because the Customer list can be large; the user
 * roster is the same small, already-fully-fetched-elsewhere list every
 * other picker in this app already uses without issue, so there's no
 * reason to introduce a second, heavier search mechanism just for this
 * one picker.
 */
function UserOverridesTab({ registry }) {
  const { message } = App.useApp();
  const { users } = useUserDirectory();
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!selectedUserId) {
      setPermissions(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    getUserPermissions(selectedUserId).then((response) => {
      if (isMounted) {
        setPermissions(response.data.data);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedUserId]);

  async function handleSave(newPermissions) {
    setIsSaving(true);

    try {
      const response = await updateUserPermissions(selectedUserId, newPermissions);
      setPermissions(response.data.data.permissions);
      message.success("User permissions updated");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset() {
    setIsResetting(true);

    try {
      const response = await resetUserPermissions(selectedUserId);
      setPermissions(response.data.data.permissions);
      message.success("Reset to the role's current default");
    } finally {
      setIsResetting(false);
    }
  }

  // Admin excluded (2026-07-31 fix) — same reasoning as Role Defaults'
  // SELECTABLE_ROLES filter (RoleDefaultsTab.jsx): admin bypasses every
  // permission check in code (`can()`'s own admin-bypass, §4.1), so editing
  // one specific admin's overrides here would be entirely meaningless —
  // there's nothing `can()` would ever actually consult it for.
  const userOptions = users
    .filter((user) => user.role !== "admin")
    .map((user) => ({
      value: user._id,
      label: `${user.name} (${USER_ROLE_LABELS[user.role] || user.role})`,
    }));

  return (
    <div className="flex flex-col gap-6">
      <Select
        showSearch
        allowClear
        style={{ width: 320 }}
        placeholder="Select a user"
        optionFilterProp="label"
        value={selectedUserId}
        onChange={setSelectedUserId}
        options={userOptions}
      />

      {selectedUserId && (
        <div className="flex flex-col gap-6">
          <Popconfirm
            title="Reset to role default?"
            description="This applies the role's CURRENT template, not whatever it was when this user was created — any custom overrides for this user will be lost."
            okText="Reset"
            okType="danger"
            onConfirm={handleReset}
          >
            <Button danger loading={isResetting}>
              Reset to Role Default
            </Button>
          </Popconfirm>

          {isLoading || !permissions ? (
            <Spin />
          ) : (
            <PermissionMatrix
              registry={registry}
              value={permissions}
              onSave={handleSave}
              isSaving={isSaving}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default UserOverridesTab;
