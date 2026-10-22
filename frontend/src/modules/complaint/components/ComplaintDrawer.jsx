import { useCallback, useEffect, useState } from "react";
import { App, Button, Drawer, Empty, Input, Select, Spin, Tag } from "antd";
import { PhoneOutlined } from "@ant-design/icons";
import { usePermission } from "../../../hooks/usePermission";
import useSessionStore from "../../../store/sessionStore";
import { fetchUserDropdown } from "../../../services/userDirectoryApi";
import { addComplaintComment, changeComplaintStatus, getComplaint, reassignComplaint } from "../api/complaintApi";
import { CALLBACK_LABEL, CATEGORY_LABEL, STAFF_STATUS } from "../constants/complaint.constants";
import { timeAgo } from "../utils/complaintTime";

/**
 * One complaint, for the person handling it: who to call (one tap), what the
 * customer said, their photos, and the one next step — "I'm on it", then
 * "Mark resolved". Admins/managers (tickets.assign) can also hand it to
 * someone else. Everything is the server's to allow; the buttons only show
 * what the server would accept.
 */
function ComplaintDrawer({ ticketId, onClose, onChanged }) {
  const { message } = App.useApp();
  const me = useSessionStore((state) => state.user);
  const canAssign = usePermission("tickets", "assign");
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [note, setNote] = useState("");
  const [people, setPeople] = useState([]);
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 640;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getComplaint(ticketId);
      setDetail(response.data.data);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not open the complaint");
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [ticketId, message, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canAssign) return;
    fetchUserDropdown()
      .then((response) => setPeople(response.data.data.filter((user) => user.role !== "customer")))
      .catch(() => setPeople([]));
  }, [canAssign]);

  const canAct = Boolean(detail) && (canAssign || detail.assignedTo?._id === me?._id);

  async function run(action, successText) {
    setIsSaving(true);
    try {
      await action();
      message.success(successText);
      setNote("");
      await load();
      onChanged?.();
    } catch (error) {
      message.error(error.response?.data?.message || "Could not save");
    } finally {
      setIsSaving(false);
    }
  }

  const contact = detail?.customer.primaryContact;
  const callNumber = contact?.phone || detail?.customer.phone;

  return (
    <Drawer
      open
      onClose={onClose}
      width={isNarrow ? "100%" : 560}
      title={detail ? `Complaint ${detail.number ?? ""}`.trim() : "Complaint"}
      extra={detail && <Tag color={STAFF_STATUS[detail.status]?.color}>{STAFF_STATUS[detail.status]?.label}</Tag>}
    >
      {isLoading && !detail ? (
        <div className="py-16 text-center"><Spin /></div>
      ) : !detail ? (
        <Empty />
      ) : (
        <div className="space-y-5">
          <section>
            <p className="text-lg font-semibold">{detail.customer.companyName}</p>
            {detail.customer.siteAddress && <p className="text-gray-500">{detail.customer.siteAddress}</p>}
            {callNumber ? (
              <Button
                type="primary"
                size="large"
                block
                icon={<PhoneOutlined />}
                href={`tel:${callNumber.replace(/\s+/g, "")}`}
                className="mt-3"
              >
                Call {contact?.name || "customer"} · {callNumber}
              </Button>
            ) : (
              <p className="mt-2 text-gray-500">No phone number saved for this customer.</p>
            )}
            {detail.callbackTime && (
              // A <div>, not a <p>: antd's unlayered reset zeroes a <p>'s top margin.
              <div className="mt-3 text-gray-700">
                Wants a call: <strong>{CALLBACK_LABEL[detail.callbackTime]}</strong>
              </div>
            )}
          </section>

          <section>
            <p className="text-sm text-gray-500">
              {CATEGORY_LABEL[detail.category] || "Complaint"} · raised {timeAgo(detail.createdAt)}
              {detail.assignedTo && ` · with ${detail.assignedTo.name}`}
            </p>
            {detail.description && <p className="mt-1 whitespace-pre-wrap text-base">{detail.description}</p>}
          </section>

          {detail.photoUrls.length > 0 && (
            <section>
              <p className="mb-2 font-semibold">Photos from the customer</p>
              <div className="grid grid-cols-3 gap-2">
                {detail.photoUrls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Customer photo ${index + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {canAct && (
            <section className="space-y-2">
              {detail.status === "open" && (
                <Button type="primary" size="large" block loading={isSaving} onClick={() => run(() => changeComplaintStatus(detail._id, "in_progress"), "Marked as in progress")}>
                  I'm on it
                </Button>
              )}
              {(detail.status === "open" || detail.status === "in_progress") && (
                <>
                  <Input.TextArea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="What was done? (optional, shown in the history)"
                  />
                  <Button size="large" block loading={isSaving} style={{ borderColor: "#1d8343", color: "#1d8343" }} onClick={() => run(() => changeComplaintStatus(detail._id, "resolved", note.trim() || undefined), "Marked as resolved")}>
                    Mark resolved
                  </Button>
                </>
              )}
              {(detail.status === "resolved" || detail.status === "closed") && (
                <Button size="large" block loading={isSaving} onClick={() => run(() => changeComplaintStatus(detail._id, "in_progress", "Reopened"), "Reopened")}>
                  Reopen
                </Button>
              )}
            </section>
          )}

          {canAssign && people.length > 0 && (
            <section>
              <p className="mb-1 font-semibold">Hand to someone else</p>
              <Select
                className="w-full"
                size="large"
                showSearch
                optionFilterProp="label"
                value={detail.assignedTo?._id}
                disabled={isSaving}
                options={people.map((person) => ({ value: person._id, label: person.name }))}
                onChange={(userId) => run(() => reassignComplaint(detail._id, userId), "Handed over")}
              />
            </section>
          )}

          <section>
            <p className="mb-2 font-semibold">History</p>
            <ul className="space-y-2">
              {detail.history.map((entry, index) => (
                <li key={index} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">
                    {entry.by} · {timeAgo(entry.createdAt)}
                  </p>
                  {entry.type === "status_change" && (
                    <p className="text-sm">Changed to <strong>{STAFF_STATUS[entry.toStatus]?.label}</strong></p>
                  )}
                  {entry.comment && <p className="whitespace-pre-wrap text-sm">{entry.comment}</p>}
                </li>
              ))}
            </ul>
            {canAct && (
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="Add a note"
                  maxLength={500}
                  onPressEnter={(event) => {
                    const text = event.currentTarget.value.trim();
                    if (text) run(() => addComplaintComment(detail._id, text), "Note added");
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

export default ComplaintDrawer;
