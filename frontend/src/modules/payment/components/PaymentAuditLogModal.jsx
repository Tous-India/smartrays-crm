import { useEffect, useState } from "react";
import { Modal, List, Tag, Empty } from "antd";
import dayjs from "dayjs";
import { getPaymentAuditLog } from "../api/paymentApi";

/**
 * Read-only edit/delete history for one payment — the "View History" action
 * this task's own spec flagged as optional-but-valuable. Fetched fresh on
 * every open (never cached), same "always live" convention already used for
 * Team's own audit-adjacent member list. `userNameById` is the same Map
 * every other Payments column already resolves display names through, not
 * a new lookup.
 *
 * Deliberately simplified (per this task's own "include if straightforward"
 * allowance): there's no per-row badge on the main table indicating which
 * payments already HAVE history, since that would need either an N+1
 * request per visible row or a backend change to return a history count/
 * flag alongside the list itself — a reasonable future addition, not built
 * here. This action is available on every row; opening it for a payment
 * with no history yet just shows an empty state.
 */
function PaymentAuditLogModal({ open, payment, onCancel, userNameById }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && payment) {
      setIsLoading(true);
      getPaymentAuditLog(payment._id)
        .then((response) => setEntries(response.data.data))
        .finally(() => setIsLoading(false));
    } else {
      setEntries([]);
    }
  }, [open, payment]);

  return (
    <Modal title="Payment History" open={open} onCancel={onCancel} footer={null} destroyOnHidden>
      <List
        loading={isLoading}
        dataSource={entries}
        locale={{ emptyText: <Empty description="No edits or deletions yet" /> }}
        renderItem={(entry) => (
          <List.Item>
            <div className="w-full">
              <div className="mb-1 flex items-center justify-between">
                <Tag color={entry.action === "deleted" ? "red" : "blue"}>
                  {entry.action === "deleted" ? "Deleted" : "Edited"}
                </Tag>
                <span className="text-xs text-gray-500">
                  {dayjs(entry.createdAt).format("DD MMM YYYY, h:mm A")}
                </span>
              </div>
              <div className="text-sm">
                <strong>{userNameById.get(entry.changedBy) || "Unknown user"}</strong>: {entry.reason}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Previous amount: ₹{entry.previousValues.amount?.toLocaleString()}
                {entry.previousValues.notes ? ` · Previous notes: ${entry.previousValues.notes}` : ""}
              </div>
            </div>
          </List.Item>
        )}
      />
    </Modal>
  );
}

export default PaymentAuditLogModal;
