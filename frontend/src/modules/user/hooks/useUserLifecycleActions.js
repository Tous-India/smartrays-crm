import { useState } from "react";
import { App } from "antd";
import {
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getDeactivationImpact,
} from "../api/userApi";

/**
 * Every User account-lifecycle action (create/edit, reset password, guarded
 * deactivate-with-reassignment §7.31, reactivate, guarded hard-delete §7.28)
 * plus the modal-open state each one needs — extracted (2026-07-31, §7.32)
 * so `UserManagementPage` and the new `UserDetailPage` share exactly one
 * implementation instead of two copies that could drift (a fix applied to
 * one guard's error handling but not the other, say). Render
 * `<UserLifecycleModals actions={...} />` (same file's sibling component)
 * to actually mount the four modals this wires up.
 *
 * `onDeleted` (optional) — `UserManagementPage` omits it (a successful
 * delete just disappears from the list on `refetch()`); `UserDetailPage`
 * supplies one that navigates back to the roster, since there's no page
 * left to show once its own subject has been deleted.
 */
export function useUserLifecycleActions({ refetch, onDeleted }) {
  const { message, modal } = App.useApp();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingUser, setEditingUser] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [reassignTarget, setReassignTarget] = useState(null);
  const [reassignImpact, setReassignImpact] = useState(null);
  const [isReassigning, setIsReassigning] = useState(false);

  function openCreateForm() {
    setFormMode("create");
    setEditingUser(null);
    setIsFormOpen(true);
  }

  function openEditForm(user) {
    setFormMode("edit");
    setEditingUser(user);
    setIsFormOpen(true);
  }

  async function handleSubmitForm(values) {
    setIsSubmittingForm(true);

    try {
      if (formMode === "create") {
        await createUser(values);
        message.success("User created");
      } else {
        await updateUser(editingUser._id, values);
        message.success("User updated");
      }
      setIsFormOpen(false);
      refetch();
    } finally {
      setIsSubmittingForm(false);
    }
  }

  async function handleDeactivate(user, reassignments) {
    try {
      await deactivateUser(user._id, reassignments);
      message.success(`${user.name} deactivated`);
      refetch();
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to deactivate user");
    }
  }

  async function handleDeactivateClick(user) {
    const response = await getDeactivationImpact(user._id);
    const impact = response.data.data;

    if (impact.teamsLed.length === 0 && impact.ownedLeadsCount === 0) {
      modal.confirm({
        title: `Deactivate ${user.name}?`,
        okText: "Deactivate",
        okButtonProps: { danger: true },
        onOk: () => handleDeactivate(user),
      });
      return;
    }

    setReassignTarget(user);
    setReassignImpact(impact);
  }

  async function handleReassignSubmit(reassignments) {
    setIsReassigning(true);

    try {
      await deactivateUser(reassignTarget._id, reassignments);
      message.success(`${reassignTarget.name} deactivated`);
      setReassignTarget(null);
      setReassignImpact(null);
      refetch();
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to deactivate user");
    } finally {
      setIsReassigning(false);
    }
  }

  async function handleReactivate(user) {
    await reactivateUser(user._id);
    message.success(`${user.name} reactivated`);
    refetch();
  }

  async function handleDelete(reason) {
    setIsDeleting(true);

    try {
      const deletedUser = deleteTarget;
      await deleteUser(deletedUser._id, reason);
      message.success(`${deletedUser.name} permanently deleted`);
      setDeleteTarget(null);

      if (onDeleted) {
        onDeleted(deletedUser);
      } else {
        refetch();
      }
    } catch (error) {
      message.error(error.response?.data?.message || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  }

  return {
    isFormOpen,
    formMode,
    editingUser,
    isSubmittingForm,
    openCreateForm,
    openEditForm,
    closeForm: () => setIsFormOpen(false),
    handleSubmitForm,

    resetPasswordTarget,
    setResetPasswordTarget,

    deleteTarget,
    setDeleteTarget,
    isDeleting,
    handleDelete,

    reassignTarget,
    reassignImpact,
    isReassigning,
    handleDeactivateClick,
    handleReactivate,
    handleReassignSubmit,
    cancelReassign: () => {
      setReassignTarget(null);
      setReassignImpact(null);
    },
  };
}

export default useUserLifecycleActions;
