import { useEffect } from "react";
import { Modal, Form, Select, DatePicker, Alert } from "antd";
import dayjs from "dayjs";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS } from "../constants/attendance.constants";

const STATUS_OPTIONS = ATTENDANCE_STATUSES.map((value) => ({ value, label: ATTENDANCE_STATUS_LABELS[value] }));

/**
 * Admin-only correction form — `mode: "edit"` calls `PATCH /attendance/:id`
 * (§7.4 addition) for an existing record; `mode: "create"` calls
 * `POST /attendance/manual` for a day that has none, fixed to whichever
 * `employeeId` the parent already knows (from the calendar cell or timeline
 * row clicked, or the Team view's selected employee / the logged-in admin's
 * own id for Personal) rather than asking for it again in the form. `date`
 * is only editable in create mode — clicking an empty calendar cell
 * pre-fills it, but the toolbar's plain "Add Record" button (no specific
 * day already chosen) needs the admin to pick one. Hours:minutes only on
 * both time pickers — same `showTime` config as `RecordPaymentModal`'s own
 * Date field, for consistency.
 *
 * The warning banner is deliberate, not decoration — every other Attendance
 * record on this page is backed by a mandatory photo + GPS coords proving
 * physical presence; this form is the one path that creates/edits a record
 * with neither, so admins need to see that consequence stated plainly
 * before saving, not just infer it from a small badge afterward.
 */
function AttendanceCorrectionModal({ open, mode, record, initialDate, onCancel, onSubmit, isSubmitting }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        date: mode === "create" ? initialDate || null : null,
        status: record?.status || "present",
        checkInTime: record?.checkIn?.time ? dayjs(record.checkIn.time) : null,
        checkOutTime: record?.checkOut?.time ? dayjs(record.checkOut.time) : null,
      });
    }
  }, [open, mode, record, initialDate, form]);

  async function handleOk() {
    let values;

    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    await onSubmit({
      date: values.date ? values.date.format("YYYY-MM-DD") : undefined,
      status: values.status,
      checkIn: { time: values.checkInTime ? values.checkInTime.toISOString() : null },
      checkOut: { time: values.checkOutTime ? values.checkOutTime.toISOString() : null },
    });
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Attendance Record" : "Add Attendance Record"}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={isSubmitting}
      okText="Save"
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        className="!mb-4"
        message="This creates an unverified, manually-adjusted record"
        description="Unlike a real check-in, this record isn't backed by a photo or GPS location. It will be visibly flagged everywhere as admin-adjusted, not a verified self-check-in."
      />

      <Form form={form} layout="vertical">
        {mode === "create" && (
          <Form.Item label="Date" name="date" rules={[{ required: true, message: "Date is required" }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        )}

        <Form.Item label="Status" name="status" rules={[{ required: true, message: "Status is required" }]}>
          <Select options={STATUS_OPTIONS} />
        </Form.Item>

        <Form.Item label="Check-In Time" name="checkInTime">
          <DatePicker showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} allowClear />
        </Form.Item>

        <Form.Item label="Check-Out Time" name="checkOutTime">
          <DatePicker showTime={{ format: "HH:mm" }} format="YYYY-MM-DD HH:mm" style={{ width: "100%" }} allowClear />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default AttendanceCorrectionModal;
