import { useState } from "react";
import { Button, Card, App } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import LeaveBalanceCard from "./LeaveBalanceCard";
import LeaveRequestModal from "./LeaveRequestModal";
import { requestLeave as requestLeaveApi } from "../api/leaveApi";

/**
 * The employee's "Apply Leave" tab (§B1, 2026-08-05) — its own tab rather
 * than a button tucked beside a list, because for an employee, requesting
 * leave IS the primary action on this page; reviewing their own history is
 * secondary and lives in the "My Leave" tab next to it.
 *
 * Deliberately thin: it reuses `LeaveRequestModal` and `LeaveBalanceCard`
 * unchanged (both survive the standalone page's removal as reusable
 * sub-components), and posts through the same `requestLeave` endpoint as
 * before. The balance is shown alongside because "how much do I have left"
 * is the question people ask immediately before filling this in.
 */
function ApplyLeavePanel() {
  const { message } = App.useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(payload) {
    setIsSubmitting(true);

    try {
      await requestLeaveApi(payload);
      message.success("Leave requested");
      setIsOpen(false);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not submit your leave request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <LeaveBalanceCard />

      <Card>
        <p className="mb-4 text-gray-500">
          Request time off. Your manager reviews it — you&apos;ll see the outcome under “My Leave”.
        </p>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsOpen(true)}>
          Request Leave
        </Button>
      </Card>

      <LeaveRequestModal
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

export default ApplyLeavePanel;
