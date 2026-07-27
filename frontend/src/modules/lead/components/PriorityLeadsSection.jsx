import { useState } from "react";
import { Card, Empty, Tag, Button } from "antd";
import { FireFilled } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const URGENCY_STYLES = {
  overdue: { color: "red", label: "Overdue", borderClass: "border-red-200" },
  today: { color: "gold", label: "Today", borderClass: "border-yellow-200" },
  upcoming: { color: "blue", label: "Upcoming", borderClass: "border-blue-200" },
};

const VISIBLE_COUNT = 4;

/**
 * Combined Hot Leads + Upcoming Follow-ups row — supersedes the two
 * separate sections this page used to render (see
 * `utils/upcomingFollowUps.js#getPriorityLeads` for the merge/dedupe/sort).
 * Capped at 4 cards per row on desktop; "+N more" expands the rest in place
 * rather than navigating away, since there's no dedicated filtered view for
 * "leads needing attention" to link to.
 */
function PriorityLeadsSection({ priorityLeads }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const visibleLeads = showAll ? priorityLeads : priorityLeads.slice(0, VISIBLE_COUNT);
  const hiddenCount = priorityLeads.length - visibleLeads.length;

  return (
    <div className="mb-4 bg-[#E8F1FB] p-1.25">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Needs Attention</h3>

      {priorityLeads.length === 0 ? (
        <Card size="small">
          <Empty
            description="No hot leads or follow-ups due in the next 3 days"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          {visibleLeads.map((lead) => {
            const urgency = lead.followUpUrgency ? URGENCY_STYLES[lead.followUpUrgency] : null;

            return (
              <Card
                key={lead._id}
                size="small"
                hoverable
                className={`w-64 cursor-pointer ${urgency ? urgency.borderClass : "border-orange-200"}`}
                onClick={() => navigate(`/leads/${lead._id}`)}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  {lead.isHot && <FireFilled className="text-orange-500" title="Hot lead" />}
                  {lead.name}
                </div>
                <div className="text-xs text-gray-500">{lead.companyName || "—"}</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="flex gap-1">
                    {lead.isHot && <Tag color="orange">Hot</Tag>}
                    {urgency && <Tag color={urgency.color}>{urgency.label}</Tag>}
                  </span>
                  {lead.followUpDate && (
                    <span className="text-xs text-gray-500">
                      {new Date(lead.followUpDate).toLocaleString()}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}

          {hiddenCount > 0 && (
            <Button type="dashed" className="h-auto w-64" onClick={() => setShowAll(true)}>
              +{hiddenCount} more, view all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default PriorityLeadsSection;
