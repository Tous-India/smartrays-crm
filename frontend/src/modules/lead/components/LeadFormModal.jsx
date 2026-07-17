import { useEffect } from "react";
import { Modal, Form, Input, Select, InputNumber, DatePicker } from "antd";
import dayjs from "dayjs";
import useLeadSources from "../hooks/useLeadSources";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";

/**
 * Shared create/edit form — Lead Detail's "Edit" action and the Table/Board
 * "New Lead" button both use this, per leads-customer-functional-spec.md's
 * field list (Name/Email/Phone/Company/Source/Owner/Budget/Follow-up/Notes).
 * `status`/`lostReason` are deliberately NOT editable here — status changes
 * always go through `useLeadStatusChangeFlow` (Table dropdown, Board drag,
 * Detail action buttons) so the `lost`-requires-reason rule is never
 * bypassable through a plain edit form.
 */
function LeadFormModal({ open, mode, initialLead, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const { sources } = useLeadSources();
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);

  // Backend forces ownerId to the creator for a sales_associate regardless
  // of what's sent (lead.service.js#resolveOwnerIdForCreate) and excludes it
  // from their updatable fields entirely — so the picker is hidden for them
  // rather than shown-then-silently-ignored.
  const canAssignOwner = currentUser?.role !== "sales_associate";

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        mode === "edit" && initialLead
          ? {
              ...initialLead,
              followUpDate: initialLead.followUpDate ? dayjs(initialLead.followUpDate) : null,
            }
          : { source: undefined }
      );
    }
  }, [open, mode, initialLead, form]);

  async function handleOk() {
    const values = await form.validateFields();

    onSubmit({
      ...values,
      followUpDate: values.followUpDate ? values.followUpDate.toISOString() : null,
    });
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Lead" : "New Lead"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
          <Input />
        </Form.Item>

        <Form.Item label="Email" name="email">
          <Input type="email" />
        </Form.Item>

        <Form.Item label="Phone" name="phone">
          <Input />
        </Form.Item>

        <Form.Item label="Company Name" name="companyName">
          <Input />
        </Form.Item>

        <Form.Item label="Source" name="source">
          <Select
            allowClear
            placeholder="Select a source"
            options={sources.map((source) => ({ value: source.name, label: source.name }))}
          />
        </Form.Item>

        {canAssignOwner && (
          <Form.Item label="Owner" name="ownerId">
            <Select
              allowClear
              placeholder="Defaults to you"
              options={users.map((user) => ({ value: user._id, label: user.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        )}

        <Form.Item label="Budget" name="budget">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Follow-up Date" name="followUpDate">
          <DatePicker showTime style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Follow-up Note" name="followUpNote">
          <Input />
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default LeadFormModal;
