import { useMemo } from "react";
import dayjs from "dayjs";
import { List, Spin, Empty } from "antd";
import LeafletMapView from "../../../components/LeafletMapView";
import useLiveLocations from "../hooks/useLiveLocations";
import useUserDirectory from "../../../hooks/useUserDirectory";

/**
 * `/location`'s Live view — one marker per currently-checked-in, visible
 * employee (§7.4b: scoping is entirely server-side via `GET /location/live`,
 * this component just renders whatever it returns). A plain list beneath
 * the map doubles as a legend and keeps the view useful even before the map
 * tiles finish loading.
 */
function LiveMapView() {
  const { liveLocations, isLoading } = useLiveLocations();
  const { users } = useUserDirectory();

  const employeeNameById = useMemo(() => new Map(users.map((user) => [user._id, user.name])), [users]);

  const markers = liveLocations.map((entry) => ({
    lat: entry.coords.lat,
    lng: entry.coords.lng,
    label: employeeNameById.get(String(entry.employeeId)) || "Unknown",
  }));

  return (
    <div className="flex flex-col gap-4">
      <LeafletMapView markers={markers} />

      {isLoading ? (
        <Spin />
      ) : liveLocations.length === 0 ? (
        <Empty description="No one is currently checked in and visible to you" />
      ) : (
        <List
          size="small"
          bordered
          dataSource={liveLocations}
          renderItem={(entry) => (
            <List.Item>
              <span className="font-medium">{employeeNameById.get(String(entry.employeeId)) || "Unknown"}</span>
              <span className="text-gray-400">Last seen {dayjs(entry.capturedAt).format("HH:mm:ss")}</span>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}

export default LiveMapView;
