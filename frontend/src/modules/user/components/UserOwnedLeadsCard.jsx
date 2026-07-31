import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Statistic } from "antd";
import { listLeads } from "../../lead/api/leadApi";
import WidgetCard from "../../dashboard/widgets/WidgetCard";

// Matches the exact "still open" definition §7.31's deactivation-impact
// endpoint already established (`CLOSED_LEAD_STATUSES` in
// `backend/src/modules/user/user.service.js`) — a won/lost lead is
// historically closed, not something to count as this person's active
// pipeline.
const CLOSED_STATUSES = ["won", "lost"];

/**
 * Count of this person's still-open leads — reuses `GET /leads` (already
 * scoped server-side to whatever the VIEWER is allowed to see, same as the
 * Leads list page itself) filtered by `owner`, the same `ownerId` filter
 * `LeadsListPage`'s own owner filter already sends. There's no single-call
 * "count excluding won/lost" endpoint (`GET /leads/count` only supports one
 * exact `status` match), so this fetches the owner-filtered list once and
 * derives the active count client-side — the same "fetch once, derive
 * client-side" approach `CustomersOverviewWidget` already uses for its own
 * contract-type counts.
 */
function UserOwnedLeadsCard({ user }) {
  const [activeCount, setActiveCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listLeads({ owner: user._id })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const leads = response.data.data;
        setActiveCount(leads.filter((lead) => !CLOSED_STATUSES.includes(lead.status)).length);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user._id]);

  return (
    <WidgetCard title="Owned Leads" isLoading={isLoading} error={error} isEmpty={false}>
      <Statistic
        title={<span className="text-xs text-gray-500">Active Leads</span>}
        value={activeCount}
        valueStyle={{ fontSize: 20 }}
      />
      <div className="mt-2 text-right text-sm">
        <Link to={`/leads?owner=${user._id}`}>View leads →</Link>
      </div>
    </WidgetCard>
  );
}

export default UserOwnedLeadsCard;
