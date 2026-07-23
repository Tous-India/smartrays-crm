import { Card, Empty, Tag } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const URGENCY_STYLES = {
  overdue: { color: "red", label: "Overdue", borderClass: "border-red-200" },
  today: { color: "gold", label: "Today", borderClass: "border-yellow-200" },
  upcoming: { color: "blue", label: "Upcoming", borderClass: "border-blue-200" },
};

/**
 * Leads whose `followUpDate` falls within the next 3 days (also surfacing
 * overdue/today ones — see `utils/upcomingFollowUps.js`), pure frontend
 * derivation from the already-fetched `leads` list, no new backend endpoint.
 */
function UpcomingFollowUpsSection({ upcomingFollowUps }) {
  const navigate = useNavigate();

  return (
    <div className="mb-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <ClockCircleOutlined />
        Upcoming Follow-ups
      </h3>

      {upcomingFollowUps.length === 0 ? (
        <Card size="small">
          <Empty description="No follow-ups due in the next 3 days" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          {upcomingFollowUps.map((lead) => {
            const urgency = URGENCY_STYLES[lead.followUpUrgency];

            return (
              <Card
                key={lead._id}
                size="small"
                hoverable
                className={`w-64 cursor-pointer ${urgency.borderClass}`}
                onClick={() => navigate(`/leads/${lead._id}`)}
              >
                <div className="font-medium">{lead.name}</div>
                <div className="text-xs text-gray-500">{lead.companyName || "—"}</div>
                <div className="mt-1.5 flex items-center justify-between">
                  <Tag color={urgency.color}>{urgency.label}</Tag>
                  <span className="text-xs text-gray-500">
                    {new Date(lead.followUpDate).toLocaleString()}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default UpcomingFollowUpsSection;
