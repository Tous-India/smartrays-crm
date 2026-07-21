import { Modal, Form, DatePicker, Select, Input, Button } from "antd";
import { REQUESTABLE_LEAVE_TYPES, LEAVE_TYPE_LABELS } from "../constants/leave.constants";

const TYPE_OPTIONS = REQUESTABLE_LEAVE_TYPES.map((type) => ({ value: type, label: LEAVE_TYPE_LABELS[type] }));

/**
 * `POST /leave/request` — a self-service request, per §7.5 needing no
 * `leave.*` grant at all (same reasoning as Attendance check-in/out).
 * `unapproved_absence` is deliberately not offered here — it's an
 * admin-only retroactive action (`mark-unapproved-absence`), never
 * something an employee requests.
 */
function LeaveRequestModal({ open, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  async function handleFinish() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      // AntD's Form already renders the per-field errors inline — nothing
      // further to do here beyond not letting the rejection go unhandled.
      return;
    }

    onSubmit({
      startDate: values.startDate.toISOString(),
      endDate: values.endDate.toISOString(),
      type: values.type,
      reason: values.reason,
    });
  }

  return (
    <Modal
      title="Request Leave"
      open={open}
      onCancel={handleCancel}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" loading={isSubmitting} onClick={handleFinish}>
          Submit Request
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" initialValues={{ type: "paid" }}>
        <Form.Item label="Start Date" name="startDate" rules={[{ required: true, message: "Start date is required" }]}>
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item label="End Date" name="endDate" rules={[{ required: true, message: "End date is required" }]}>
          <DatePicker className="w-full" />
        </Form.Item>
        <Form.Item label="Type" name="type" rules={[{ required: true }]}>
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="Reason" name="reason">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default LeaveRequestModal;
