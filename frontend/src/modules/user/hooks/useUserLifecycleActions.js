import { useState } from "react";
import { App } from "antd";
import {
  createUser,
  deactivateUser,
  deleteUser,
  getDeactivationImpact,
  getUser,
  reactivateUser,
  updateUser,
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

  /**
   * Opens the edit form on a FRESHLY FETCHED user, not the table row (§7.55).
   *
   * `baseSalary` is `select: false`, so `GET /users` does not return it and the
   * row carries no salary at all — the form rendered an empty box for someone
   * who has one. `GET /users/:id` returns it for an admin, so the form is
   * filled from that.
   *
   * The row is shown FIRST and replaced when the fetch lands, rather than
   * blocking the modal on a request: every other field is already correct in
   * the row, and an edit dialog that hangs on open is worse than one that fills
   * in a beat later. If the fetch fails the row's own data stands, which is
   * exactly the previous behaviour rather than a broken form.
   */
  async function openEditForm(user) {
    setFormMode("edit");
    setEditingUser(user);
    setIsFormOpen(true);

    try {
      const response = await getUser(user._id);
      setEditingUser(response.data.data);
    } catch {
      // Keep the row's data — no worse than before this fetch existed.
    }
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
