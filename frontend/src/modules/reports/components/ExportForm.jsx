import { useMemo, useState } from "react";
import { Card, Select, DatePicker, Space, Empty } from "antd";
import dayjs from "dayjs";
import { usePermission } from "../../../hooks/usePermission";
import ReportDownloadButton from "../../../components/ReportDownloadButton";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "../../lead/constants/lead.constants";
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS } from "../../customer/constants/customer.constants";

const { RangePicker } = DatePicker;
const DATE_FORMAT = "YYYY-MM-DD";

const LEAD_STATUS_OPTIONS = LEAD_STATUSES.map((value) => ({ value, label: LEAD_STATUS_LABELS[value] }));
const CUSTOMER_STATUS_OPTIONS = CUSTOMER_STATUSES.map((value) => ({ value, label: CUSTOMER_STATUS_LABELS[value] }));
const LEAVE_SCOPE_OPTIONS = [
  { value: "own", label: "Own" },
  { value: "team", label: "Team" },
  { value: "all", label: "All" },
];
const PAYROLL_SCOPE_OPTIONS = [
  { value: "own", label: "Own" },
  { value: "all", label: "All" },
];

/**
 * Proper UI home for the existing raw export dispatcher (`POST
 * /reports/generate`, §7.11) — module + filters + format, then reuses
 * `ReportDownloadButton` (already wired to `generateReport`/
 * `triggerFileDownload`) for the actual download, rather than
 * re-implementing that request/download flow a second time.
 *
 * Each module's `filters` shape mirrors `report.validation.js`'s own
 * per-module validator exactly (attendance/transport: from/to;
 * leave/payroll: scope; leads/customers: status) — no filter fields this
 * form offers that the backend wouldn't accept.
 */
function ExportForm() {
  // Same coarse "can attempt this module's report at all" gate
  // `report.service.js#MODULE_HANDLERS[module].canAccess` enforces
  // server-side — filtering the module list to match avoids offering an
  // option that's guaranteed to 403 on click.
  const canLeads = usePermission("leads", "view");
  const canCustomers = usePermission("customers", "view");
  const canAttendanceTeam = usePermission("attendance", "view_team");
  const canAttendanceAll = usePermission("attendance", "view_all");
  const canTransportTeam = usePermission("travelLogs", "view_team");
  const canTransportAll = usePermission("travelLogs", "view_all");
  const canLeaveOwn = usePermission("leave", "view");
  const canLeaveTeam = usePermission("leave", "view_team");
  const canLeaveAll = usePermission("leave", "view_all");
  const canPayroll = usePermission("payroll", "view");

  const moduleOptions = useMemo(
    () =>
      [
        canLeads && { value: "leads", label: "Leads" },
        canCustomers && { value: "customers", label: "Customers" },
        (canAttendanceTeam || canAttendanceAll) && { value: "attendance", label: "Attendance" },
        (canLeaveOwn || canLeaveTeam || canLeaveAll) && { value: "leave", label: "Leave" },
        (canTransportTeam || canTransportAll) && { value: "transport", label: "Travel Logs" },
        canPayroll && { value: "payroll", label: "Payroll" },
      ].filter(Boolean),
    [
      canLeads,
      canCustomers,
      canAttendanceTeam,
      canAttendanceAll,
      canLeaveOwn,
      canLeaveTeam,
      canLeaveAll,
      canTransportTeam,
      canTransportAll,
      canPayroll,
    ]
  );

  const [selectedModule, setSelectedModule] = useState(moduleOptions[0]?.value);
  const [dateRange, setDateRange] = useState(null);
  const [scope, setScope] = useState("own");
  const [status, setStatus] = useState(undefined);

  function buildFilters() {
    switch (selectedModule) {
      case "attendance":
      case "transport":
        return dateRange
          ? { from: dateRange[0].format(DATE_FORMAT), to: dateRange[1].format(DATE_FORMAT) }
          : {};
      case "leave":
        return { scope };
      case "payroll":
        return { scope };
      case "leads":
        return status ? { status } : {};
      case "customers":
        return status ? { status } : {};
      default:
        return {};
    }
  }

  function handleModuleChange(value) {
    setSelectedModule(value);
    setDateRange(null);
    setStatus(undefined);
    setScope("own");
  }

  if (moduleOptions.length === 0) {
    return (
      <Card title={<span className="text-sm font-medium">Export Report</span>}>
        <Empty description="No reports available for your role" />
      </Card>
    );
  }

  return (
    <Card title={<span className="text-sm font-medium">Export Report</span>}>
      <Space direction="vertical" size="middle" className="w-full">
        <Space wrap>
          <Select
            value={selectedModule}
            onChange={handleModuleChange}
            options={moduleOptions}
            style={{ width: 180 }}
          />

          {(selectedModule === "attendance" || selectedModule === "transport") && (
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              disabledDate={(date) => date && date > dayjs().endOf("day")}
            />
          )}

          {selectedModule === "leave" && (
            <Select value={scope} onChange={setScope} options={LEAVE_SCOPE_OPTIONS} style={{ width: 140 }} />
          )}

          {selectedModule === "payroll" && (
            <Select value={scope} onChange={setScope} options={PAYROLL_SCOPE_OPTIONS} style={{ width: 140 }} />
          )}

          {selectedModule === "leads" && (
            <Select
              value={status}
              onChange={setStatus}
              options={LEAD_STATUS_OPTIONS}
              placeholder="Any status"
              allowClear
              style={{ width: 180 }}
            />
          )}

          {selectedModule === "customers" && (
            <Select
              value={status}
              onChange={setStatus}
              options={CUSTOMER_STATUS_OPTIONS}
              placeholder="Any status"
              allowClear
              style={{ width: 180 }}
            />
          )}
        </Space>

        <ReportDownloadButton module={selectedModule} filters={buildFilters()} filenamePrefix={selectedModule} />
      </Space>
    </Card>
  );
}

export default ExportForm;
