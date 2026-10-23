import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Statistic } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { fetchLiveStatus } from "../../location/api/locationApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

// The statuses that mean "on a shift right now", and the two that need someone
// to act (the same groups as the app's "Today at a glance").
const ON_SHIFT = ["moving", "stationary", "at_site", "offline", "location_off", "disconnected"];
const ATTENTION = ["location_off", "disconnected"];

/**
 * Live staff (2026-10-23) — on shift, need attention, not checked in, from
 * GET /location/live-status (the manager's team, everyone for an admin —
 * the server decides), and the Live Map one tap away. Gated on the same
 * location grant as the Live Map tab itself.
 */
function LiveStaffWidget() {
  const canViewTeam = usePermission("location", "view_team");
  const canViewAll = usePermission("location", "view_all");
  const canView = canViewTeam || canViewAll;
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    fetchLiveStatus()
      .then((response) => !cancelled && setPeople(response.data.data.people))
      .catch((fetchError) => !cancelled && setError(fetchError));

    return () => {
      cancelled = true;
    };
  }, [canView]);

  if (!canView) {
    return null;
  }

  const count = (statuses) => (people || []).filter((person) => statuses.includes(person.status)).length;
  const tiles = [
    { key: "on_shift", title: "On shift", value: count(ON_SHIFT) },
    { key: "attention", title: "Need attention", value: count(ATTENTION), danger: true },
    { key: "not_checked_in", title: "Not checked in", value: count(["not_checked_in"]) },
  ];

  return (
    <WidgetCard title="Live staff" isLoading={people === null && !error} error={error}>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.key} data-testid={`live-staff-${tile.key}`}>
            <Statistic
              title={tile.title}
              value={tile.value}
              valueStyle={tile.danger && tile.value > 0 ? { color: "#dc2626" } : undefined}
            />
          </div>
        ))}
      </div>
      {/* The same plain "→" link every other widget ends with. */}
      <div className="mt-2 text-left text-sm">
        <Link to={`${ROUTE_PATHS.ATTENDANCE}?tab=live-map`} aria-label="Open live map">
          Open live map →
        </Link>
      </div>
    </WidgetCard>
  );
}

export default LiveStaffWidget;
