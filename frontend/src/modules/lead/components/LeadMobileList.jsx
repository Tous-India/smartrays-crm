import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Empty, Spin, Tag } from "antd";
import { FireFilled, PhoneOutlined } from "@ant-design/icons";
import { LEAD_STATUS_COLORS, LEAD_STATUS_LABELS } from "../constants/lead.constants";
import { formatDateTime } from "../../../utils/date.utils";

const PAGE_SIZE = 20;

/**
 * The leads list on a phone (2026-10-23) — instead of the wide table, one
 * card per lead: name, status, company, follow-up (red once it has passed),
 * owner, and the two things a salesperson does from a phone: Call (opens the
 * dialler) and Log call. Tapping the card opens the lead, where every other
 * action is. 20 at a time, then "Show more".
 */
function LeadMobileList({ leads, isLoading, users, onLogCall }) {
  const navigate = useNavigate();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const ownerName = new Map(users.map((user) => [user._id, user.name]));

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <Spin />
      </div>
    );
  }
  if (leads.length === 0) {
    return <Empty description="No leads match these filters." className="py-8" />;
  }

  return (
    <div data-testid="lead-mobile-list">
      <ul className="space-y-2">
        {leads.slice(0, visibleCount).map((lead) => {
          const overdue = lead.followUpDate && new Date(lead.followUpDate) < new Date();
          return (
            <li key={lead._id} data-testid="lead-mobile-card" className="rounded-xl border border-gray-200 bg-white p-3">
              <button type="button" onClick={() => navigate(`/leads/${lead._id}`)} className="block w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 text-base font-semibold">
                    {lead.isHot && <FireFilled style={{ color: "#fa8c16" }} aria-label="Hot lead" />}
                    <span className="truncate">{lead.name}</span>
                  </span>
                  <Tag color={LEAD_STATUS_COLORS[lead.status]} className="!mr-0 shrink-0">
                    {LEAD_STATUS_LABELS[lead.status]}
                  </Tag>
                </div>
                {lead.companyName && <div className="truncate text-sm text-gray-600">{lead.companyName}</div>}
                <div className="mt-1 text-sm text-gray-500">
                  {lead.followUpDate ? (
                    <span style={overdue ? { color: "#cf1322", fontWeight: 600 } : undefined}>
                      Follow-up {formatDateTime(lead.followUpDate)}
                    </span>
                  ) : (
                    "No follow-up set"
                  )}
                  {ownerName.get(lead.ownerId) && ` · ${ownerName.get(lead.ownerId)}`}
                </div>
              </button>
              <div className="mt-2 flex gap-2">
                {lead.phone && (
                  <Button
                    type="primary"
                    size="large"
                    icon={<PhoneOutlined />}
                    href={`tel:${lead.phone.replace(/\s+/g, "")}`}
                    className="flex-1"
                  >
                    Call
                  </Button>
                )}
                <Button size="large" className="flex-1" onClick={() => onLogCall(lead)}>
                  Log call
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {visibleCount < leads.length && (
        <Button block size="large" className="mt-3" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
          Show more ({leads.length - visibleCount} left)
        </Button>
      )}
    </div>
  );
}

export default LeadMobileList;
