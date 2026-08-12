import PayrollYearView from "../modules/payroll/components/PayrollYearView";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";
import PlaceholderPage from "../components/PlaceholderPage";

/**
 * `/payroll` — the pay run index (§7.57, 2026-08-12).
 *
 * ONE entry point: a year of runs, one row per month, clicking through to that
 * run's review table. The month/year picker lives only inside the "Run payroll"
 * modal.
 *
 * Gated on `payroll.run`, the see-everyone tier. NOT `payroll.view`: that means
 * "own payslip only" and sits in the default employee template, so gating this
 * on it would show every employee the whole company's pay. The endpoints
 * enforce the same; this only decides what is worth rendering.
 */
function PayrollPage() {
  const user = useSessionStore((state) => state.user);

  if (!can(user, "payroll", "run")) {
    return <PlaceholderPage title="Payroll" />;
  }

  return <PayrollYearView />;
}

export default PayrollPage;
