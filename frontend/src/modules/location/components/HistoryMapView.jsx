import { useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Select, Space, Empty, Alert } from "antd";
import LeafletMapView from "../../../components/LeafletMapView";
import useLocationHistory from "../hooks/useLocationHistory";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";

/**
 * `/location`'s History view — pick an employee + a past date, render that
 * day's ping trail (`GET /location/history`, §7.4b) as a polyline. An
 * out-of-scope `employeeId` 404s per the backend's own precedent (§7.1) —
 * surfaced here as a plain error message, not a silent empty map.
 *
 * **Reused, not forked, for the Attendance map integration (§7.4d,
 * 2026-08-04)** — `AttendanceLocationMapModal.jsx` renders this same
 * component pre-locked to one specific employee/day via
 * `initialEmployeeId`/`initialDate`/`showControls={false}`, rather than a
 * second map view being built from scratch. `deriveExtraMarkers(pings)` is
 * an optional escape hatch for a caller to plot markers derived from this
 * component's own fetched pings (e.g. connectivity-gap boundaries,
 * geofence-violation points) without this component needing to know
 * anything about what Attendance-specific business logic they represent —
 * every existing caller that doesn't pass it behaves identically to before.
 */
function HistoryMapView({ initialEmployeeId, initialDate, showControls = true, deriveExtraMarkers }) {
  const currentUser = useSessionStore((state) => state.user);
  const { users } = useUserDirectory();
  const [employeeId, setEmployeeId] = useState(initialEmployeeId || currentUser?._id || "");
  const [date, setDate] = useState(initialDate ? dayjs(initialDate) : dayjs());

  const dateKey = date.format("YYYY-MM-DD");
  const { pings, isLoading, error } = useLocationHistory({ employeeId, date: dateKey });

  const employeeOptions = users.map((user) => ({ value: user._id, label: user.name }));
  const path = pings.map((ping) => ({ lat: ping.coords.lat, lng: ping.coords.lng }));
  const extraMarkers = deriveExtraMarkers ? deriveExtraMarkers(pings) : [];

  return (
    <div className="flex flex-col gap-4">
      {showControls && (
        <Space>
          <Select
            value={employeeId}
            options={employeeOptions}
            style={{ width: 220 }}
            showSearch
            optionFilterProp="label"
            placeholder="Select an employee"
            onChange={setEmployeeId}
          />
          <DatePicker value={date} allowClear={false} onChange={(value) => setDate(value || dayjs())} />
        </Space>
      )}

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load this employee's location history"
          description={error.response?.status === 404 ? "That employee isn't visible to you." : "Please try again."}
        />
      ) : !isLoading && pings.length === 0 ? (
        <Empty description="No location pings recorded for this day" />
      ) : (
        <LeafletMapView path={path} markers={extraMarkers} />
      )}
    </div>
  );
}

export default HistoryMapView;
