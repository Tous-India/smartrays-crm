import { Modal, Form, DatePicker, InputNumber, Select, Input } from "antd";
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from "../constants/lead.constants";

const OUTCOME_OPTIONS = CALL_OUTCOMES.map((outcome) => ({
  value: outcome,
  label: CALL_OUTCOME_LABELS[outcome],
}));

/**
 * "Log Call" action per leads-customer-functional-spec.md: date, duration,
 * outcome (connected/no answer/voicemail/callback), notes — saved to
 * `lead_calls` (`LeadCall` here). Duration is entered in minutes for a
 * friendlier form, converted to `durationSeconds` on submit to match the
 * backend field.
 */
function LogCallModal({ open, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

  async function handleOk() {
    const values = await form.validateFields();

    await onSubmit({
      calledAt: values.calledAt.toISOString(),
      durationSeconds: Math.round((values.durationMinutes || 0) * 60),
      outcome: values.outcome,
      notes: values.notes,
    });

    form.resetFields();
  }

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  return (
    <Modal
      title="Log Call"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Date & Time"
          name="calledAt"
          rules={[{ required: true, message: "Call date/time is required" }]}
        >
          <DatePicker showTime style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Duration (minutes)" name="durationMinutes">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          label="Outcome"
          name="outcome"
          rules={[{ required: true, message: "Outcome is required" }]}
        >
          <Select options={OUTCOME_OPTIONS} placeholder="Select an outcome" />
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default LogCallModal;
