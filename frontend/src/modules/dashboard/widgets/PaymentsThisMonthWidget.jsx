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
 * `payment.service.js#listPayments`). Calls `listPayments()` with no filter
 * params (returns every row unpaginated) and sums client-side over the
 * current month — could now use the backend's own `from`/`to` filtering
 * instead, but that's a pre-existing widget this task didn't ask to
 * optimize, only to keep working after the response shape changed to
 * `{ items, total, page, limit }`.
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
        const thisMonthPayments = response.data.data.items.filter((payment) => {
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
      <Statistic
        title={<span className="text-xs text-gray-500">Total recorded</span>}
        value={totalAmount}
        prefix="₹"
        valueStyle={{ fontSize: 20 }}
      />
      <div className="mt-2 text-right text-sm">
        <Link to={ROUTE_PATHS.PAYMENTS}>View all payments →</Link>
      </div>
    </WidgetCard>
  );
}

export default PaymentsThisMonthWidget;
