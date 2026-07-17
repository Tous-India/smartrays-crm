import { useEffect } from "react";
import { Modal, Form, Input, Select } from "antd";
import useUserDirectory from "../../../hooks/useUserDirectory";

const BILLING_TYPE_OPTIONS = [
  { value: "registered", label: "Registered (GST)" },
  { value: "non_gst", label: "Non-GST" },
  { value: "overseas", label: "Overseas" },
];

/**
 * Pre-fills from the lead's own data (name/email/phone/companyName/source)
 * but stays fully editable before submit, per leads-customer-functional-
 * spec.md's Convert-to-Customer rule. `projectManagerId` has no lead-derived
 * fallback — Lead has no equivalent field, and it's the one value the
 * backend requires (`lead.validation.js#validateConvertLeadInput`) — so it's
 * the only field that starts empty and must be chosen here.
 */
function ConvertToCustomerModal({ open, lead, onCancel, onConfirm, isSubmitting }) {
  const [form] = Form.useForm();
  const { users } = useUserDirectory();

  useEffect(() => {
    if (open && lead) {
      form.setFieldsValue({
        companyName: lead.companyName || lead.name,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        projectManagerId: undefined,
        billingType: undefined,
      });
    }
  }, [open, lead, form]);

  async function handleOk() {
    const values = await form.validateFields();
    await onConfirm(values);
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title="Convert to Customer"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      okText="Convert"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Company Name"
          name="companyName"
          rules={[{ required: true, message: "Company name is required" }]}
        >
          <Input />
        </Form.Item>

        <Form.Item label="Email" name="email">
          <Input type="email" />
        </Form.Item>

        <Form.Item label="Phone" name="phone">
          <Input />
        </Form.Item>

        <Form.Item label="Source" name="source">
          <Input />
        </Form.Item>

        <Form.Item
          label="Project Manager"
          name="projectManagerId"
          rules={[{ required: true, message: "A project manager is required" }]}
        >
          <Select
            placeholder="Select a project manager"
            options={users.map((user) => ({ value: user._id, label: `${user.name} (${user.role})` }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item label="Billing Type" name="billingType">
          <Select placeholder="Optional" options={BILLING_TYPE_OPTIONS} allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ConvertToCustomerModal;
