import { useEffect } from "react";
import { Modal, Form, Input, Checkbox, Row, Col } from "antd";

/**
 * Add/Edit Contact. One component serves both modes, so the two-column
 * layout below applies to Edit Contact identically.
 *
 * **Two fields per row (2026-08-05)** — every field used to be stacked
 * full-width, which made a five-field form taller than it needed to be.
 * Paired by what belongs together: identity (Name + Designation), then how
 * to reach them (Email + Phone). The Primary-contact toggle keeps its own
 * full-width row — it's a single checkbox with different semantics from the
 * text fields above it, and pairing it against a lone input would read as
 * though the two were related. Uses the same `Row gutter={16}` /
 * `Col span={12}` pattern as `CustomerEditModal`/`LeadFormModal` rather
 * than new spacing values; AntD's own `Col` collapses inside the modal's
 * responsive width, so no horizontal overflow on a narrow viewport.
 */
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
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Designation" name="designation">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Email" name="email">
              <Input type="email" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Phone" name="phone">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="isPrimary" valuePropName="checked">
          <Checkbox>Primary contact</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ContactFormModal;
