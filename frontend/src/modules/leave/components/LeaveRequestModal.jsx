import { Modal, Form, DatePicker, Select, Input, Checkbox, Button } from "antd";
import { REQUESTABLE_LEAVE_TYPES, LEAVE_TYPE_LABELS } from "../constants/leave.constants";

const TYPE_OPTIONS = REQUESTABLE_LEAVE_TYPES.map((type) => ({ value: type, label: LEAVE_TYPE_LABELS[type] }));

/**
 * `POST /leave/request` — a self-service request, per §7.5 needing no
 * `leave.*` grant at all (same reasoning as Attendance check-in/out).
 * `unapproved_absence` is deliberately not offered here — it's an
 * admin-only retroactive action (`mark-unapproved-absence`), never
 * something an employee requests.
 *
 * Half Day (added later): a plain checkbox, not a separate "duration" field
 * — checking it force-syncs End Date to Start Date (a half day only ever
 * describes a single day, enforced server-side too, §7.5) and hides the End
 * Date field entirely rather than leaving it editable-but-ignored.
 */
function LeaveRequestModal({ open, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();
  const isHalfDay = Form.useWatch("isHalfDay", form);

  function handleCancel() {
    form.resetFields();
    onCancel();
  }

  function handleHalfDayChange(event) {
    const checked = event.target.checked;
    form.setFieldValue("isHalfDay", checked);

    if (checked) {
      form.setFieldValue("endDate", form.getFieldValue("startDate"));
    }
  }

  function handleStartDateChange(value) {
    if (form.getFieldValue("isHalfDay")) {
      form.setFieldValue("endDate", value);
    }
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
      endDate: (values.isHalfDay ? values.startDate : values.endDate).toISOString(),
      type: values.type,
      reason: values.reason,
      isHalfDay: Boolean(values.isHalfDay),
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
      <Form form={form} layout="vertical" initialValues={{ type: "paid", isHalfDay: false }}>
        <Form.Item name="isHalfDay" valuePropName="checked">
          <Checkbox onChange={handleHalfDayChange}>Half Day</Checkbox>
        </Form.Item>
        <Form.Item label="Start Date" name="startDate" rules={[{ required: true, message: "Start date is required" }]}>
          <DatePicker className="w-full" onChange={handleStartDateChange} />
        </Form.Item>
        {!isHalfDay && (
          <Form.Item
            label="End Date"
            name="endDate"
            rules={[{ required: true, message: "End date is required" }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
        )}
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
