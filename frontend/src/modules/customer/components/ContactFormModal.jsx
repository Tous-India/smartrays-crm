import { useEffect } from "react";
import { Modal, Form, Input, Checkbox } from "antd";

function ContactFormModal({ open, mode, initialContact, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue(mode === "edit" && initialContact ? initialContact : {});
    }
  }, [open, mode, initialContact, form]);

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
      title={mode === "edit" ? "Edit Contact" : "Add Contact"}
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
        <Form.Item label="Designation" name="designation">
          <Input />
        </Form.Item>
        <Form.Item name="isPrimary" valuePropName="checked">
          <Checkbox>Primary contact</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ContactFormModal;
