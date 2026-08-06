import { useEffect, useState } from "react";
import { Select, Button, Popconfirm, Spin, App } from "antd";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { USER_ROLE_LABELS } from "../../user/constants/user.constants";
import {
  getUserPermissions,
  updateUserPermissions,
  resetUserPermissions,
  getRoleTemplate,
} from "../api/permissionApi";
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
 *
 * `initialUserId` (added 2026-07-31, §7.32) — preselects a user on mount,
 * for `PermissionManagementPage`'s own `?userId=` deep-link. Only ever
 * applied once: this is deliberately `useState`'s initializer, not a
 * `useEffect` synced to the prop, so a later change to the prop (there
 * isn't one today, but there's no reason to fight it if one existed) never
 * yanks the picker away from whatever the admin has since selected by hand.
 */
function UserOverridesTab({ registry, initialUserId = null }) {
  const { message } = App.useApp();
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);
  const [selectedUserId, setSelectedUserId] = useState(initialUserId);
  const [permissions, setPermissions] = useState(null);
  // §7.41 — the role template is fetched as a SECOND baseline, purely so the
  // matrix can mark which of this user's grants diverge from it. Never
  // written back; it is a reference, not an edit target.
  const [templatePermissions, setTemplatePermissions] = useState(null);
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

    const selectedUser = users.find((user) => user._id === selectedUserId);

    Promise.all([
      getUserPermissions(selectedUserId),
      selectedUser ? getRoleTemplate(selectedUser.role) : Promise.resolve(null),
    ])
      .then(([permissionsResponse, templateResponse]) => {
        if (isMounted) {
          setPermissions(permissionsResponse.data.data);
          setTemplatePermissions(templateResponse?.data?.data?.permissions ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedUserId, users]);

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
              templatePermissions={templatePermissions}
              isEditingSelf={String(selectedUserId) === String(currentUser?._id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default UserOverridesTab;
