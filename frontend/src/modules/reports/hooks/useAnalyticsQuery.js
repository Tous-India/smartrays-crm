import { useCallback, useEffect, useState } from "react";

/**
 * One shared fetch/loading/error hook for every analytics chart section,
 * same shape as `payment/hooks/usePayments.js`. Each chart section calls
 * this independently with its own endpoint function — one section's fetch
 * failing only ever sets that section's own `error`, never affects any
 * other section (same isolation principle Dashboard's widgets already
 * established via `WidgetCard`).
 *
 * `enabled` (default true) skips the fetch entirely — used to short-circuit
 * a section a user has no permission to view, same as `usePayments`.
 */
export function useAnalyticsQuery(fetchFn, params, { enabled = true, defaultValue = null } = {}) {
  const [data, setData] = useState(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const paramsKey = JSON.stringify(params);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchFn(params);
      setData(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}

export default useAnalyticsQuery;
