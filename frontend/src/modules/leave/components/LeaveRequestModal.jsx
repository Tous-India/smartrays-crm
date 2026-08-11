import { Modal, Form, DatePicker, Select, Input, Checkbox, Button, Row, Col } from "antd";
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
        {/*
          Two fields per row (2026-08-10), following the Add Contact form on
          Customer Detail — `Row gutter={16}` + `Col span={12}` — rather than
          inventing new spacing. `xs={24} sm={12}` collapses to one column below
          768px, which is AntD's `sm` breakpoint.

          Pairing: the two dates belong together, and half/full day sits beside
          paid/unpaid since both describe what KIND of leave this is. Reason is
          free text and keeps its own full-width row.

          Layout only — field names, rules and submitted payload are untouched.
        */}
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Start Date" name="startDate" rules={[{ required: true, message: "Start date is required" }]}>
              <DatePicker className="w-full" onChange={handleStartDateChange} />
            </Form.Item>
          </Col>
          {/* A half day is a single date, so End Date is not rendered at all —
              Start Date then takes the full row rather than leaving a gap where
              a field used to be. */}
          {!isHalfDay && (
            <Col xs={24} sm={12}>
              <Form.Item
                label="End Date"
                name="endDate"
                rules={[{ required: true, message: "End date is required" }]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Type" name="type" rules={[{ required: true }]}>
              <Select options={TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            {/* Deliberately NO `label` here. Adding one re-computes the
                checkbox's accessible name from the label instead of its own
                text, so it stopped being findable as "Half Day" — a behaviour
                change, in a layout-only task. The top margin aligns it with
                the Select beside it on desktop and drops away below `sm`,
                where the fields stack anyway. */}
            <Form.Item name="isHalfDay" valuePropName="checked" className="sm:!mt-[30px]">
              <Checkbox onChange={handleHalfDayChange}>Half Day</Checkbox>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="Reason"
          name="reason"
          rules={[{ required: true, whitespace: true, message: "A reason is required" }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default LeaveRequestModal;
