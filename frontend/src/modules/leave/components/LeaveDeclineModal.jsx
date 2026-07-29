import { useState, useEffect } from "react";
import { Modal, Input } from "antd";

/**
 * `PATCH /leave/:id/decline` — a plain text prompt rather than `Popconfirm`
 * (unlike Approve/Mark-Unapproved-Absence's confirm-only actions, decline
 * optionally takes a `reason`, which `Popconfirm` has no field for).
 */
function LeaveDeclineModal({ open, onCancel, onSubmit, isSubmitting }) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
    }
  }, [open]);

  return (
    <Modal
      title="Decline Leave Request"
      open={open}
      onCancel={onCancel}
      onOk={() => onSubmit(reason.trim() || undefined)}
      okText="Decline"
      okButtonProps={{ danger: true }}
      confirmLoading={isSubmitting}
      destroyOnHidden
    >
      <p className="mb-2 text-sm text-gray-600">
        Optionally tell the employee why this request is being declined — they&apos;ll see this
        reason in their notification.
      </p>
      <Input.TextArea
        rows={3}
        placeholder="Reason (optional)"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
    </Modal>
  );
}

export default LeaveDeclineModal;
