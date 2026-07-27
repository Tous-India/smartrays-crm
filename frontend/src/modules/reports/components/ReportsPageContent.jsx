import { usePermission } from "../../../hooks/usePermission";
import PermissionGate from "../../../routes/PermissionGate";
import { useAnalyticsDateRange } from "../hooks/useAnalyticsDateRange";
import DateRangeFilter from "./DateRangeFilter";
import LeadsPipelineChart from "./LeadsPipelineChart";
import LeadsConversionChart from "./LeadsConversionChart";
import LeadsBySourceChart from "./LeadsBySourceChart";
import LeadsByClientTypeChart from "./LeadsByClientTypeChart";
import CustomersGrowthChart from "./CustomersGrowthChart";
import CustomersStatusSplitChart from "./CustomersStatusSplitChart";
import CustomersContractValueChart from "./CustomersContractValueChart";
import PaymentsTrendChart from "./PaymentsTrendChart";
import AmcRenewalsUpcomingList from "./AmcRenewalsUpcomingList";
import AttendanceTrendChart from "./AttendanceTrendChart";
import PayrollCostTrendChart from "./PayrollCostTrendChart";
import ExportForm from "./ExportForm";

/**
 * `/reports` — Reports & Analytics. Sections mirror this task's own
 * grouping (Leads / Customers / Financial / Workforce), each independently
 * permission-gated to match its endpoints' real backend access rule
 * (§5's matrix) rather than a single page-level gate — a role with no view
 * access to a module never sees that section at all, per-chart, since
 * "Financial"/"Workforce" each bundle two DIFFERENT permissions
 * (Payments vs AMC, Attendance vs Payroll) that don't always travel
 * together for a given role.
 *
 * The one shared `DateRangeFilter` (`useAnalyticsDateRange`) drives every
 * trend-based chart (Leads Conversion, Customer Growth, Payments Trend,
 * Attendance Trend, Payroll Cost Trend) — the non-trend charts (pipeline,
 * by-source, by-client-type, status split, contract value, AMC renewals)
 * aren't date-scoped by design (their own endpoints take no from/to).
 */
function ReportsPageContent() {
  const canViewLeads = usePermission("leads", "view");
  const canViewCustomers = usePermission("customers", "view");
  const canViewPayments = usePermission("payments", "view");
  const canViewAmc = usePermission("amc", "view");
  const canViewAttendanceTeam = usePermission("attendance", "view_team");
  const canViewAttendanceAll = usePermission("attendance", "view_all");
  const canRunPayroll = usePermission("payroll", "run");

  const canViewAttendance = canViewAttendanceTeam || canViewAttendanceAll;
  const canViewFinancial = canViewPayments || canViewAmc;
  const canViewWorkforce = canViewAttendance || canRunPayroll;

  const { activeFilter, setActiveFilter, customRange, setCustomRange, dateRange } = useAnalyticsDateRange();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 text-lg font-semibold">Reports &amp; Analytics</h2>
        <DateRangeFilter
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      </div>

      <PermissionGate module="leads" action="view">
        <section>
          <h3 className="mb-3 text-base font-semibold">Leads</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <LeadsPipelineChart />
            <LeadsConversionChart dateRange={dateRange} />
            <LeadsBySourceChart />
            <LeadsByClientTypeChart />
          </div>
        </section>
      </PermissionGate>

      <PermissionGate module="customers" action="view">
        <section>
          <h3 className="mb-3 text-base font-semibold">Customers</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CustomersGrowthChart dateRange={dateRange} />
            <CustomersStatusSplitChart />
            <CustomersContractValueChart />
          </div>
        </section>
      </PermissionGate>

      {canViewFinancial && (
        <section>
          <h3 className="mb-3 text-base font-semibold">Financial</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {canViewPayments && <PaymentsTrendChart dateRange={dateRange} />}
            {canViewAmc && <AmcRenewalsUpcomingList />}
          </div>
        </section>
      )}

      {canViewWorkforce && (
        <section>
          <h3 className="mb-3 text-base font-semibold">Workforce</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {canViewAttendance && <AttendanceTrendChart dateRange={dateRange} />}
            {canRunPayroll && <PayrollCostTrendChart dateRange={dateRange} />}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-base font-semibold">Export</h3>
        <ExportForm />
      </section>
    </div>
  );
}

export default ReportsPageContent;
