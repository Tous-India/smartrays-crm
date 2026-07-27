import { useCallback, useEffect, useState } from "react";
import { listPayments } from "../api/paymentApi";

/**
 * Same shape as `useCustomers`/`useLeads` — refetches whenever `filters`
 * changes (compared by JSON value, so a fresh object literal each render
 * doesn't cause an extra fetch). Unlike those, `GET /payments` is genuinely
 * paginated server-side (payment.service.js's own comment explains why), so
 * this also tracks `total` for the table's controlled pagination.
 *
 * `enabled` (default true) skips the fetch entirely rather than firing it
 * and discarding the result — same guard `PaymentsThisMonthWidget` already
 * uses for a `payments.view`-gated caller, since React's hook-call rules
 * mean `usePayments()` itself still has to run unconditionally even when
 * the page it's called from is about to render a 403 instead of the table.
 */
export function usePayments(filters, { enabled = true } = {}) {
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const filtersKey = JSON.stringify(filters);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await listPayments(filters);
      setPayments(response.data.data.items);
      setTotal(response.data.data.total);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { payments, total, isLoading, error, refetch };
}

export default usePayments;
