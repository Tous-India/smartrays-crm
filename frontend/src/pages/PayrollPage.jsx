import PayrollRunReview from "../modules/payroll/components/PayrollRunReview";
import useSessionStore from "../store/sessionStore";
import { can } from "../utils/permission.utils";
import PlaceholderPage from "../components/PlaceholderPage";

/**
 * `/payroll` — the pay run (§7.54, 2026-08-12). Was a placeholder.
 *
 * Gated on `payroll.run`, the see-everyone tier. NOT `payroll.view`: that means
 * "own payslip only" and sits in the default employee template, so gating this
 * on it would show every employee the whole company's pay. The endpoints behind
 * it enforce the same thing — this only decides what is worth rendering.
 */
function PayrollPage() {
  const user = useSessionStore((state) => state.user);

  if (!can(user, "payroll", "run")) {
    return <PlaceholderPage title="Payroll" />;
  }

  return <PayrollRunReview />;
}

export default PayrollPage;
