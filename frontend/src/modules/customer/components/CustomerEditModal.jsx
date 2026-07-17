import { useEffect } from "react";
import { Modal, Form, Input, Select } from "antd";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";
import { BILLING_TYPE_LABELS } from "../constants/customer.constants";

const BILLING_TYPE_OPTIONS = Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/**
 * One shared edit form for both the header's "Edit" button and the Billing
 * card's own "Edit billing" button — the backend has a single
 * `PATCH /customers/:id` covering every field (there's no separate billing
 * endpoint), so two different entry points opening the same form (just
 * scrolled/focused differently in a future pass) is more honest than
 * pretending there are two distinct save operations.
 */
function CustomerEditModal({ open, customer, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const { users } = useUserDirectory();
  const currentUser = useSessionStore((state) => state.user);

  const canReassignOwner = currentUser?.role !== "sales_associate";

  useEffect(() => {
    if (open && customer) {
      form.setFieldsValue(customer);
    }
  }, [open, customer, form]);

  async function handleOk() {
    const values = await form.validateFields();
    onSubmit(values);
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title="Edit Customer"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
      width={640}
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
        <Form.Item label="Website" name="website">
          <Input />
        </Form.Item>
        <Form.Item label="Industry" name="industry">
          <Input />
        </Form.Item>
        <Form.Item label="Source" name="source">
          <Input />
        </Form.Item>
        {canReassignOwner && (
          <Form.Item label="Owner" name="ownerId">
            <Select
              options={users.map((user) => ({ value: user._id, label: user.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        )}
        <Form.Item label="Project Manager" name="projectManagerId">
          <Select
            options={users.map((user) => ({ value: user._id, label: user.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item label="Billing Type" name="billingType">
          <Select allowClear options={BILLING_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="Billing Name" name="billingName">
          <Input />
        </Form.Item>
        <Form.Item label="Billing Address" name="billingAddress">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="Billing State" name="billingState">
          <Input placeholder='e.g. "07 Delhi"' />
        </Form.Item>
        <Form.Item label="GSTIN" name="gstin">
          <Input />
        </Form.Item>
        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default CustomerEditModal;
