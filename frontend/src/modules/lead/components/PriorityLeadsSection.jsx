import { Card, Empty, Tag } from "antd";
import { FireFilled } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const URGENCY_STYLES = {
  overdue: { color: "red", label: "Overdue", borderClass: "border-red-200" },
  today: { color: "gold", label: "Today", borderClass: "border-yellow-200" },
  upcoming: { color: "blue", label: "Upcoming", borderClass: "border-blue-200" },
};

/**
 * Combined Hot Leads + Upcoming Follow-ups row — supersedes the two
 * separate sections this page used to render (see
 * `utils/upcomingFollowUps.js#getPriorityLeads` for the merge/dedupe/sort).
 * Renders every qualifying lead via flex-wrap with `flex-1 basis-64` cards
 * (not CSS Grid's `repeat(4, 1fr)`) so ANY short row — a total under 4, or
 * the trailing wrapped row when there are more than 4 — stretches its cards
 * to fill the width instead of leaving empty grid cells; a fixed-column
 * grid only fills full rows, not partial ones. No "+N more" cap: this list
 * is bounded by "hot" + "due in the next 3 days", not by total lead count.
 */
function PriorityLeadsSection({ priorityLeads }) {
  const navigate = useNavigate();

  return (
    <div className="mb-4 bg-[#E8F1FB] p-1.25 rounded-[7px]">
      <h3 className="mb-2 text-sm font-semibold text-gray-700 p-[10px] pb-0">Needs Attention</h3>

      {priorityLeads.length === 0 ? (
        <Card size="small">
          <Empty
            description="No hot leads or follow-ups due in the next 3 days"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3 p-[10px]">
          {priorityLeads.map((lead) => {
            const urgency = lead.followUpUrgency ? URGENCY_STYLES[lead.followUpUrgency] : null;

            return (
              <Card
                key={lead._id}
                size="small"
                hoverable
                className={`flex-1 basis-64 cursor-pointer ${urgency ? urgency.borderClass : "border-orange-200"}`}
                onClick={() => navigate(`/leads/${lead._id}`)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 font-medium">
                    {/* `style` for color, not a Tailwind className — AntD's
                        `Card` sets its own text color that a plain utility
                        class loses to (same issue found and fixed
                        everywhere else this icon appears). Shown alongside
                        the "Hot" tag below, not instead of it — the icon is
                        a quick glance cue in the header, the tag is the
                        explicit label. */}
                    {lead.isHot && <FireFilled style={{ color: "#fa8c16" }} title="Hot lead" />}
                    {lead.name}
                  </span>
                  {lead.followUpDate && (
                    <span className="whitespace-nowrap text-xs text-gray-500">
                      {new Date(lead.followUpDate).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{lead.companyName || "—"}</div>
                <div className="mt-1.5 flex items-center gap-1">
                  {lead.isHot && <Tag color="orange">Hot</Tag>}
                  {urgency && <Tag color={urgency.color}>{urgency.label}</Tag>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PriorityLeadsSection;
