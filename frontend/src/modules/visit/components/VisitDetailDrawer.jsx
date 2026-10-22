import { useEffect, useState } from "react";
import { App, Drawer, Empty, Spin, Tag } from "antd";
import { getVisit } from "../api/visitApi";
import { fetchLocationHistory } from "../../location/api/locationApi";
import { VISIT_STATUS, explainVisit } from "../constants/visit.constants";
import VisitMap from "./VisitMap";

/**
 * One site visit next to that day's actual route (2026-10-22): the site and
 * its geofence, the phone's pings for the whole day, where Arrived / Done /
 * each photo happened, the photos with their GPS distance and time, and the
 * employee's notes. The route comes from the existing location history
 * endpoint — the same data the Live Map's history uses.
 */
const time = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function VisitDetailDrawer({ visitId, onClose }) {
  const { message } = App.useApp();
  const [visit, setVisit] = useState(null);
  const [route, setRoute] = useState([]);
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 640;

  useEffect(() => {
    let cancelled = false;
    getVisit(visitId)
      .then(async (response) => {
        const data = response.data.data;
        if (cancelled) return;
        setVisit(data);
        try {
          const history = await fetchLocationHistory({ employeeId: data.assignee._id, date: new Date(data.dueDate).toISOString().slice(0, 10) });
          if (!cancelled) setRoute((history.data.data.pings || []).map((ping) => ping.coords));
        } catch {
          if (!cancelled) setRoute([]);
        }
      })
      .catch((error) => {
        message.error(error.response?.data?.message || "Could not open the visit");
        onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [visitId, message, onClose]);

  return (
    <Drawer open onClose={onClose} width={isNarrow ? "100%" : 640} title={visit ? `${visit.assignee.name} · ${visit.customer.companyName}` : "Site visit"} extra={visit && <Tag color={VISIT_STATUS[visit.status]?.color}>{VISIT_STATUS[visit.status]?.label}</Tag>}>
      {!visit ? (
        <div className="py-16 text-center"><Spin /></div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-base font-semibold">{visit.purpose}</div>
            {visit.siteAddress && <div className="text-gray-500">{visit.siteAddress}</div>}
            <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2" data-testid="visit-explanation">{explainVisit(visit)}</div>
          </div>

          <VisitMap site={visit.site} radiusMeters={visit.radiusMeters} route={route} arrival={visit.arrival} completion={visit.completion} photos={visit.photos} height={isNarrow ? 280 : 340} />
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#163b78" }} />Site ({visit.radiusMeters} m)</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#64748b" }} />Route that day</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#1971c2" }} />Arrived</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#2f9e44" }} />Done</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#9c36b5" }} />Photos</span>
          </div>

          <div>
            <div className="mb-2 font-semibold">Site photos</div>
            {visit.photos.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No photos" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visit.photos.map((photo, index) => (
                  <a key={photo._id} href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={photo.url} alt={`Site photo ${index + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                    <div className="mt-1 text-xs text-gray-600">{time(photo.takenAt)} · {photo.distanceMeters} m from site</div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {visit.notes && (
            <div>
              <div className="mb-1 font-semibold">Notes</div>
              <div className="whitespace-pre-wrap">{visit.notes}</div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export default VisitDetailDrawer;
