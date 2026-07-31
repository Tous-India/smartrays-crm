import UserFormModal from "./UserFormModal";
import AdminResetPasswordModal from "./AdminResetPasswordModal";
import DeleteUserModal from "./DeleteUserModal";
import DeactivationReassignModal from "./DeactivationReassignModal";

/**
 * Renders the four modals `useUserLifecycleActions` (same module's sibling
 * hook) drives — shared by `UserManagementPage` and `UserDetailPage` so
 * there's exactly one place wiring these up, not two.
 */
function UserLifecycleModals({ actions, userDirectory }) {
  return (
    <>
      <UserFormModal
        open={actions.isFormOpen}
        mode={actions.formMode}
        initialUser={actions.editingUser}
        onCancel={actions.closeForm}
        onSubmit={actions.handleSubmitForm}
        isSubmitting={actions.isSubmittingForm}
      />

      <AdminResetPasswordModal
        open={Boolean(actions.resetPasswordTarget)}
        targetUser={actions.resetPasswordTarget}
        onCancel={() => actions.setResetPasswordTarget(null)}
      />

      <DeleteUserModal
        open={Boolean(actions.deleteTarget)}
        user={actions.deleteTarget}
        onCancel={() => actions.setDeleteTarget(null)}
        onSubmit={actions.handleDelete}
        isSubmitting={actions.isDeleting}
      />

      <DeactivationReassignModal
        open={Boolean(actions.reassignTarget)}
        user={actions.reassignTarget}
        impact={actions.reassignImpact}
        users={userDirectory}
        onCancel={actions.cancelReassign}
        onSubmit={actions.handleReassignSubmit}
        isSubmitting={actions.isReassigning}
      />
    </>
  );
}

export default UserLifecycleModals;
