import { Button, Tooltip, Space } from "antd";
import { EditOutlined, LockOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined } from "@ant-design/icons";

/**
 * The Edit/Reset Password/Deactivate/Reactivate/Delete icon+Tooltip button
 * set (§7.28/§7.31) — extracted (2026-07-31, §7.32) so the User Detail
 * page's header can reuse the exact same buttons `UserManagementPage.jsx`'s
 * Actions column already renders, rather than a second copy that could
 * quietly drift out of sync (different icon, different aria-label, a fix
 * applied to one but not the other). Purely presentational: every handler
 * is a callback prop, so each page keeps owning its own modals/state
 * (`UserFormModal`, `AdminResetPasswordModal`, `DeleteUserModal`,
 * `DeactivationReassignModal`) exactly as before — this component only
 * decides which buttons are visible for a given `user`/`currentUser`/
 * `isAdmin` combination and wires clicks to whatever the caller passed in.
 */
function UserActionButtons({
  user,
  currentUser,
  isAdmin,
  onEdit,
  onResetPassword,
  onDeactivateClick,
  onReactivate,
  onDelete,
}) {
  const canEdit = isAdmin || user._id === currentUser?._id;

  return (
    <Space wrap>
      {canEdit && (
        <Tooltip title="Edit">
          <Button type="text" size="small" icon={<EditOutlined />} aria-label="Edit" onClick={() => onEdit(user)} />
        </Tooltip>
      )}
      {isAdmin && (
        <Tooltip title="Reset Password">
          <Button
            type="text"
            size="small"
            icon={<LockOutlined />}
            aria-label="Reset Password"
            onClick={() => onResetPassword(user)}
          />
        </Tooltip>
      )}
      {isAdmin && user.isActive && user._id !== currentUser?._id && (
        <Tooltip title="Deactivate">
          <Button
            danger
            type="text"
            size="small"
            icon={<StopOutlined />}
            aria-label="Deactivate"
            onClick={() => onDeactivateClick(user)}
          />
        </Tooltip>
      )}
      {isAdmin && !user.isActive && (
        <Tooltip title="Reactivate">
          <Button
            type="text"
            size="small"
            icon={<CheckCircleOutlined />}
            aria-label="Reactivate"
            onClick={() => onReactivate(user)}
          />
        </Tooltip>
      )}
      {isAdmin && !user.isActive && (
        <Tooltip title="Delete">
          <Button
            danger
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            aria-label="Delete"
            onClick={() => onDelete(user)}
          />
        </Tooltip>
      )}
    </Space>
  );
}

export default UserActionButtons;
