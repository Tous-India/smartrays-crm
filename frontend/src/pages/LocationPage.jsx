import { useState } from "react";
import { Segmented, Result } from "antd";
import LiveMapView from "../modules/location/components/LiveMapView";
import HistoryMapView from "../modules/location/components/HistoryMapView";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";

const VIEW_OPTIONS = [
  { value: "live", label: "Live" },
  { value: "history", label: "History" },
];

/**
 * `/location` — a new route (§7.4b had no frontend UI at all before this
 * task; the API shape was deliberately designed for this). Gated by the
 * existing `location` `PERMISSION_REGISTRY` set (`view`/`view_team`/
 * `view_all`) — any one of the three is enough to reach the page at all;
 * each sub-view's own data fetch is what's actually scoped server-side.
 */
function LocationPage() {
  const user = useSessionStore((state) => state.user);
  const [view, setView] = useState("live");

  const canViewLocation =
    can(user, "location", "view") || can(user, "location", "view_team") || can(user, "location", "view_all");

  if (!canViewLocation) {
    return (
      <Result
        status="403"
        title="Not authorized"
        subTitle="You do not have permission to view location data."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} />
      {view === "live" ? <LiveMapView /> : <HistoryMapView />}
    </div>
  );
}

export default LocationPage;
