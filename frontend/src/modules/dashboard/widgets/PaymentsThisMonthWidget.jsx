import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Statistic } from "antd";
import { usePermission } from "../../../hooks/usePermission";
import { listPayments } from "../../payment/api/paymentApi";
import { ROUTE_PATHS } from "../../../constants/routePaths.constants";
import WidgetCard from "./WidgetCard";

/**
 * Sum of payment amounts recorded in the current calendar month, admin-only
 * (§5's matrix: `payments.view`/`create` are "–" for every other role, no
 * ownership scoping exists at all for this module — see
 * `payment.service.js#listPayments`). Reuses `listPayments()` with no
 * filter params (the endpoint takes none) and sums client-side over the
 * current month, since there's no date-range filter on the backend either.
 */
function PaymentsThisMonthWidget() {
  const canView = usePermission("payments", "view");
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canView) {
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listPayments()
      .then((response) => {
        if (cancelled) {
          return;
        }
        const now = new Date();
        const thisMonthPayments = response.data.data.filter((payment) => {
          const paymentDate = new Date(payment.date);
          return (
            paymentDate.getFullYear() === now.getFullYear() && paymentDate.getMonth() === now.getMonth()
          );
        });
        setTotalAmount(thisMonthPayments.reduce((sum, payment) => sum + payment.amount, 0));
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canView]);

  if (!canView) {
    return null;
  }

  return (
    <WidgetCard title="Payments This Month" isLoading={isLoading} error={error} isEmpty={false}>
      <Statistic title="Total recorded" value={totalAmount} prefix="₹" />
      <div className="mt-3 text-right">
        <Link to={ROUTE_PATHS.PAYMENTS}>View all payments →</Link>
      </div>
    </WidgetCard>
  );
}

export default PaymentsThisMonthWidget;
