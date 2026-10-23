import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Empty, Segmented, Spin, Tag } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { useIsPhone } from "../../../hooks/useIsPhone";
import { listComplaints } from "../api/complaintApi";
import { PRIORITY, STAFF_STATUS } from "../constants/complaint.constants";
import { isVisitOverdue, timeAgo } from "../utils/complaintTime";
import { formatDate } from "../../../utils/date.utils";
import ShareComplaintLinkButton from "./ShareComplaintLinkButton";

/**
 * `/complaints` (2026-10-23) — customer complaints from the public form.
 *
 * - Assigners (admin, or `complaints.assign` / `complaints.view_all`): every
 *   complaint, unassigned ones highlighted on top, filters All / Unassigned /
 *   Assigned / Resolved, and the "Share complaint link" button.
 * - Everyone else: "My complaints" — what is assigned to them (the server
 *   decides), Active / Resolved.
 *
 * Cards, not a table, so it reads on a phone; a tap opens `/complaints/:id`.
 */
const ASSIGNER_FILTERS = [
  { value: "all", label: "All", match: () => true },
  { value: "unassigned", label: "Unassigned", match: (row) => row.status === "open" },
  { value: "assigned", label: "Assigned", match: (row) => ["assigned", "on_the_way", "working"].includes(row.status) },
  { value: "resolved", label: "Resolved", match: (row) => ["resolved", "closed"].includes(row.status) },
];
const TECHNICIAN_FILTERS = [
  { value: "active", label: "Active", match: (row) => !["resolved", "closed"].includes(row.status) },
  { value: "resolved", label: "Resolved", match: (row) => ["resolved", "closed"].includes(row.status) },
];

function ComplaintRow({ row, onOpen }) {
  const unassigned = row.status === "open";
  const priority = PRIORITY[row.priority];
  const overdue = isVisitOverdue(row);
  return (
    <li>
      <button
        type="button"
        data-testid="complaint-row"
        data-number={row.number}
        data-unassigned={unassigned ? "true" : "false"}
        onClick={() => onOpen(row._id)}
        className={`flex w-full items-start justify-between gap-3 rounded-xl border bg-white p-4 text-left hover:border-brand-navy ${
          unassigned ? "border-l-4 border-red-300 border-l-red-600 bg-red-50/40" : "border-gray-200"
        }`}
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 font-semibold">
            <span>{row.number}</span>
            <span>{row.customerName || row.contactName || "Customer"}</span>
          </p>
          <p className="text-sm text-gray-600">{row.contactPhone}</p>
          <p className="truncate text-gray-700">{row.description}</p>
          <p className="text-sm text-gray-500">
            {timeAgo(row.createdAt)}
            {row.assigneeName && ` · ${row.assigneeName}`}
            {row.visitDate && ` · visit ${formatDate(row.visitDate)}`}
          </p>
          {overdue && <p className="text-sm font-semibold text-red-700">Visit date has passed</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Tag color={STAFF_STATUS[row.status]?.color} className="!mr-0">
            {STAFF_STATUS[row.status]?.label}
          </Tag>
          {priority && (
            <Tag color={priority.color} className="!mr-0">
              {priority.label}
            </Tag>
          )}
        </div>
      </button>
    </li>
  );
}

function ComplaintsPage() {
  const canAssign = usePermission("complaints", "assign");
  const canSeeAll = usePermission("complaints", "view_all") || canAssign;
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const filters = canSeeAll ? ASSIGNER_FILTERS : TECHNICIAN_FILTERS;
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(filters[0].value);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listComplaints();
      setRows(response.data.data);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => Object.fromEntries(filters.map((f) => [f.value, rows.filter(f.match).length])), [rows, filters]);
  const shown = useMemo(() => rows.filter(filters.find((f) => f.value === filter)?.match || (() => true)), [rows, filter, filters]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{canSeeAll ? "Complaints" : "My complaints"}</h1>
          <p className="text-gray-500">
            {canSeeAll
              ? "From the public complaint form. Assign each one to a technician."
              : "Complaints assigned to you. Tap one to call the customer and update it."}
          </p>
        </div>
        {canAssign && <ShareComplaintLinkButton />}
      </div>

      {/* Four full labels do not fit across a phone: there they scroll sideways
          instead of being cut to "Unass…". */}
      <div className={isPhone ? "-mx-1 overflow-x-auto px-1 pb-1" : ""}>
        <Segmented
          block={!isPhone}
          size="large"
          value={filter}
          onChange={setFilter}
          options={filters.map((f) => ({ value: f.value, label: `${f.label} (${counts[f.value] ?? 0})` }))}
        />
      </div>

      {error && <Alert type="error" showIcon message="Could not load complaints" action={<Button onClick={load}>Try again</Button>} />}

      {isLoading ? (
        <div className="py-16 text-center">
          <Spin />
        </div>
      ) : shown.length === 0 ? (
        <Empty description={filter === "unassigned" ? "Nothing waiting — everything is assigned." : "Nothing here."} className="py-10" />
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => (
            <ComplaintRow key={row._id} row={row} onOpen={(id) => navigate(`/complaints/${id}`)} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default ComplaintsPage;
