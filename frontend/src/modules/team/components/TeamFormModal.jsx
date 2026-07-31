import { useEffect } from "react";
import { Modal, Form, Input, Select } from "antd";
import useTeamTypes from "../hooks/useTeamTypes";

/**
 * Create/edit a Team — name, type, and a head (manager or admin only,
 * filtered client-side from the same lightweight `users` list every other
 * "assign to" picker in this app already fetches via `useUserDirectory`, per
 * this task's own instruction to reuse it rather than a new lookup).
 *
 * `type` is a `Select` against the admin-managed `GET /team-types` list
 * (§7.30, 2026-07-31), the same `useLeadSources`-populated-dropdown pattern
 * the Lead form already uses for its own Source field — a reversal of the
 * earlier free-text `Input` here, since `Team.type` is now validated
 * server-side against that same list (`team.service.js#ensureValidTeamType`).
 * Filtered to `isActive` types only — an admin managing the list elsewhere
 * can retire a type without it still being offered for new teams, while an
 * existing team keeps whatever type value it already has.
 */
function TeamFormModal({ open, mode, initialTeam, users, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const { types } = useTeamTypes();
  const typeOptions = types
    .filter((type) => type.isActive)
    .map((type) => ({ value: type.name, label: type.name }));

  // An existing team's own type value stays selectable/visible in the
  // dropdown even if that type has since been deactivated elsewhere —
  // otherwise editing a legacy team would silently blank out its type the
  // moment this form opens, purely because it's no longer offered for NEW
  // teams.
  if (
    mode === "edit" &&
    initialTeam?.type &&
    !typeOptions.some((option) => option.value === initialTeam.type)
  ) {
    typeOptions.push({ value: initialTeam.type, label: `${initialTeam.type} (inactive)` });
  }

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        mode === "edit" && initialTeam
          ? { name: initialTeam.name, type: initialTeam.type, headManagerId: initialTeam.headManagerId }
          : {}
      );
    }
  }, [open, mode, initialTeam, form]);

  const headOptions = users
    .filter((user) => user.role === "manager" || user.role === "admin")
    .map((user) => ({ value: user._id, label: user.name }));

  async function handleOk() {
    const values = await form.validateFields();
    await onSubmit(values);
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Team" : "Create Team"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Save"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
          <Input placeholder='e.g. "North Sales Team"' />
        </Form.Item>

        <Form.Item label="Type" name="type">
          <Select allowClear showSearch optionFilterProp="label" options={typeOptions} placeholder="Select a type (optional)" />
        </Form.Item>

        <Form.Item
          label="Head (Manager or Admin)"
          name="headManagerId"
          rules={[{ required: true, message: "A head is required" }]}
        >
          <Select showSearch optionFilterProp="label" options={headOptions} placeholder="Select a manager or admin" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default TeamFormModal;
