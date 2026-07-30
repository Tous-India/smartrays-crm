import { useEffect } from "react";
import { Modal, Form, Input, Select } from "antd";

/**
 * Create/edit a Team — name, free-text type, and a head (manager or admin
 * only, filtered client-side from the same lightweight `users` list every
 * other "assign to" picker in this app already fetches via
 * `useUserDirectory`, per this task's own instruction to reuse it rather
 * than a new lookup). `type` is a plain text input, not a Select against a
 * fixed list — Team.type is deliberately free text (team.model.js) so an
 * admin isn't blocked from naming a new kind of team as the org grows.
 */
function TeamFormModal({ open, mode, initialTeam, users, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

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
          <Input placeholder='e.g. "Sales", "Technical", "Installation" (optional)' />
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
