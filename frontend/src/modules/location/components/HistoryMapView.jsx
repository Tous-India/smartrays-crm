import { useState } from "react";
import dayjs from "dayjs";
import { DatePicker, Select, Space, Empty, Alert } from "antd";
import GoogleMapView from "../../../components/GoogleMapView";
import useLocationHistory from "../hooks/useLocationHistory";
import useUserDirectory from "../../../hooks/useUserDirectory";
import useSessionStore from "../../../store/sessionStore";

/**
 * `/location`'s History view — pick an employee + a past date, render that
 * day's ping trail (`GET /location/history`, §7.4b) as a polyline. An
 * out-of-scope `employeeId` 404s per the backend's own precedent (§7.1) —
 * surfaced here as a plain error message, not a silent empty map.
 */
function HistoryMapView() {
  const currentUser = useSessionStore((state) => state.user);
  const { users } = useUserDirectory();
  const [employeeId, setEmployeeId] = useState(currentUser?._id || "");
  const [date, setDate] = useState(dayjs());

  const dateKey = date.format("YYYY-MM-DD");
  const { pings, isLoading, error } = useLocationHistory({ employeeId, date: dateKey });

  const employeeOptions = users.map((user) => ({ value: user._id, label: user.name }));
  const path = pings.map((ping) => ({ lat: ping.coords.lat, lng: ping.coords.lng }));

  return (
    <div className="flex flex-col gap-4">
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
        <GoogleMapView path={path} />
      )}
    </div>
  );
}

export default HistoryMapView;
