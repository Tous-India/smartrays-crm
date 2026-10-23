import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, DatePicker, Empty, Result, Spin, Tag } from "antd";
import { LeftOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { usePermission } from "../../../hooks/usePermission";
import { listVisits } from "../api/visitApi";
import { VISIT_STATUS, explainVisit } from "../constants/visit.constants";
import VisitDetailDrawer from "./VisitDetailDrawer";
import AssignVisitModal from "./AssignVisitModal";

/**
 * `/visits` (2026-10-22) — verified site visits, one day at a time. Each
 * visit shows the system's verdict (Verified / Left early / Not at site /
 * At site now / Not started) with one plain sentence saying why; a tap opens
 * it next to that day's real route. Problems first, so the owner sees them
 * without reading the whole list. Scope is the server's: admin all, manager
 * their team, an employee their own.
 */
const ORDER = ["not_at_site", "left_early", "at_site", "not_started", "verified"];

function VisitsPage() {
  const canView = usePermission("services", "view");
  const canAssign = usePermission("services", "create");
  const navigate = useNavigate();
  const { id: openId } = useParams();
  const [date, setDate] = useState(dayjs());
  const [visits, setVisits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listVisits(date.format("YYYY-MM-DD"));
      setVisits(response.data.data);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (canView) load();
  }, [load, canView]);

  const sorted = useMemo(() => [...visits].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)), [visits]);
  const problems = visits.filter((visit) => visit.status === "not_at_site" || visit.status === "left_early").length;

  if (!canView) {
    return <Result status="403" title="No access" subTitle="You do not have access to site visits." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Site visits</h1>
          <span className="text-gray-500">Checked by the phone's location — not by what anyone reports.</span>
        </div>
        {canAssign && (
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setIsAssigning(true)}>
            Assign a visit
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<LeftOutlined />} onClick={() => setDate((d) => d.subtract(1, "day"))} aria-label="Previous day" />
        <DatePicker value={date} onChange={(value) => value && setDate(value)} allowClear={false} format="ddd, DD MMM YYYY" />
        <Button icon={<RightOutlined />} onClick={() => setDate((d) => d.add(1, "day"))} aria-label="Next day" />
        {!date.isSame(dayjs(), "day") && <Button onClick={() => setDate(dayjs())}>Today</Button>}
        {problems > 0 && <Tag color="red" className="ml-1">{problems} need a look</Tag>}
      </div>

      {error && <Alert type="error" showIcon message="Could not load visits" action={<Button onClick={load}>Try again</Button>} />}

      {isLoading ? (
        <div className="py-16 text-center"><Spin /></div>
      ) : sorted.length === 0 ? (
        <Empty description="No visits on this day." className="py-10" />
      ) : (
        <ul className="space-y-2">
          {sorted.map((visit) => (
            <li key={visit._id}>
              <button
                type="button"
                onClick={() => navigate(`/visits/${visit._id}`)}
                className="flex w-full items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-brand-navy"
              >
                <div className="min-w-0">
                  <div className="font-semibold">
                    {visit.assignee.name} · {visit.customer.companyName}
                  </div>
                  <div className="text-gray-600">{visit.purpose}{visit.siteAddress ? ` · ${visit.siteAddress}` : ""}</div>
                  <div className="text-sm text-gray-500">{explainVisit(visit)}</div>
                </div>
                <Tag color={VISIT_STATUS[visit.status]?.color} className="shrink-0">
                  {VISIT_STATUS[visit.status]?.label}
                </Tag>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && <VisitDetailDrawer visitId={openId} onClose={() => navigate("/visits")} />}
      {isAssigning && (
        <AssignVisitModal
          defaultDate={date}
          onClose={() => setIsAssigning(false)}
          onAssigned={() => {
            setIsAssigning(false);
            load();
          }}
        />
      )}
    </div>
  );
}

export default VisitsPage;
