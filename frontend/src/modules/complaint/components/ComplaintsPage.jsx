import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Empty, Result, Segmented, Spin, Switch, Tag } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import useSessionStore from "../../../store/sessionStore";
import { listComplaints } from "../api/complaintApi";
import { CATEGORY_LABEL, STAFF_STATUS } from "../constants/complaint.constants";
import { overdueText, timeAgo } from "../utils/complaintTime";
import ComplaintDrawer from "./ComplaintDrawer";

/**
 * `/complaints` (2026-10-22) — customer complaints (the Tickets backend). One
 * page for every role: the server decides what each person sees (admin and
 * managers: all; employees: the ones assigned to them). Three tabs in plain
 * words — Waiting, In progress, Resolved — with the overdue ones in red, the
 * same rule the server escalates on. Cards, not a table, so it reads on a
 * phone; a tap opens the complaint.
 *
 * `/complaints/:id` opens one directly — the notification links use it.
 */
const TABS = [
  { value: "waiting", label: "Waiting", statuses: ["open"] },
  { value: "in_progress", label: "In progress", statuses: ["in_progress"] },
  { value: "resolved", label: "Resolved", statuses: ["resolved", "closed"] },
];

function ComplaintsPage() {
  const me = useSessionStore((state) => state.user);
  const canSeeAll = usePermission("tickets", "view_all");
  const canSeeAssigned = usePermission("tickets", "view_assigned");
  const navigate = useNavigate();
  const { id: openId } = useParams();
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("waiting");
  const [onlyMine, setOnlyMine] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listComplaints();
      setTickets(response.data.data);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canSeeAll || canSeeAssigned) load();
  }, [load, canSeeAll, canSeeAssigned]);

  const visible = useMemo(
    () => (onlyMine ? tickets.filter((ticket) => ticket.assignedToId === me?._id) : tickets),
    [tickets, onlyMine, me]
  );

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.value, visible.filter((ticket) => t.statuses.includes(ticket.status)).length])),
    [visible]
  );

  const shown = useMemo(() => {
    const statuses = TABS.find((t) => t.value === tab).statuses;
    const list = visible.filter((ticket) => statuses.includes(ticket.status));
    // Overdue first, then oldest first — the one to do next is on top.
    return list.sort((a, b) => {
      const overdue = Number(Boolean(overdueText(b))) - Number(Boolean(overdueText(a)));
      return overdue || new Date(a.createdAt) - new Date(b.createdAt);
    });
  }, [visible, tab]);

  if (!canSeeAll && !canSeeAssigned) {
    return <Result status="403" title="No access" subTitle="You do not have access to complaints." />;
  }

  const openTicket = (id) => navigate(id ? `/complaints/${id}` : "/complaints");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Complaints</h1>
          <p className="text-gray-500">From customers' complaint links. Tap one to call the customer and update it.</p>
        </div>
        {canSeeAll && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={onlyMine} onChange={setOnlyMine} aria-label="Only complaints assigned to me" />
            Only mine
          </label>
        )}
      </div>

      <Segmented
        block
        size="large"
        value={tab}
        onChange={setTab}
        options={TABS.map((t) => ({ value: t.value, label: `${t.label} (${counts[t.value] ?? 0})` }))}
      />

      {error && (
        <Alert type="error" showIcon message="Could not load complaints" action={<Button onClick={load}>Try again</Button>} />
      )}

      {isLoading ? (
        <div className="py-16 text-center"><Spin /></div>
      ) : shown.length === 0 ? (
        <Empty description={tab === "waiting" ? "Nothing waiting — all picked up." : "Nothing here."} className="py-10" />
      ) : (
        <ul className="space-y-2">
          {shown.map((ticket) => {
            const late = overdueText(ticket);
            return (
              <li key={ticket._id}>
                <button
                  type="button"
                  onClick={() => openTicket(ticket._id)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-brand-navy"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {ticket.number ? `${ticket.number} · ` : ""}
                      {ticket.customerName || "Customer"}
                    </p>
                    <p className="truncate text-gray-600">{ticket.subject}</p>
                    <p className="text-sm text-gray-500">
                      {CATEGORY_LABEL[ticket.category] || "Complaint"} · {timeAgo(ticket.createdAt)}
                      {ticket.assigneeName && ` · ${ticket.assigneeName}`}
                    </p>
                    {late && <p className="text-sm font-semibold text-red-700">{late}</p>}
                  </div>
                  <Tag color={STAFF_STATUS[ticket.status]?.color} className="shrink-0">
                    {STAFF_STATUS[ticket.status]?.label}
                  </Tag>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openId && <ComplaintDrawer ticketId={openId} onClose={() => openTicket(null)} onChanged={load} />}
    </div>
  );
}

export default ComplaintsPage;
