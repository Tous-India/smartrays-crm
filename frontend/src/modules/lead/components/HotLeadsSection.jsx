import { Card, Empty, Tag } from "antd";
import { FireFilled } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

/**
 * Pinned, always-visible section (not filter-dependent) surfacing every
 * `isHot: true` lead regardless of the Table/Board filters above it — pure
 * frontend derivation from the already-fetched `leads` list, no new backend
 * endpoint (see `utils/upcomingFollowUps.js#getHotLeads`).
 */
function HotLeadsSection({ hotLeads }) {
  const navigate = useNavigate();

  return (
    <div className="mb-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <FireFilled className="text-orange-500" />
        Hot Leads
      </h3>

      {hotLeads.length === 0 ? (
        <Card size="small">
          <Empty description="No hot leads right now" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : (
        <div className="flex flex-wrap gap-3">
          {hotLeads.map((lead) => (
            <Card
              key={lead._id}
              size="small"
              hoverable
              className="w-64 cursor-pointer border-orange-200"
              onClick={() => navigate(`/leads/${lead._id}`)}
            >
              <div className="flex items-center gap-1.5 font-medium">
                <FireFilled className="text-orange-500" />
                {lead.name}
              </div>
              <div className="text-xs text-gray-500">{lead.companyName || "—"}</div>
              <Tag className="mt-1.5" color="orange">
                Hot
              </Tag>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default HotLeadsSection;
