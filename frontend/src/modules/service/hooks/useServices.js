import { useCallback, useEffect, useState } from "react";
import { listServices } from "../api/serviceApi";

/**
 * The full scoped list, unfiltered — the page splits it into its two
 * columns client-side, because both columns and both counts come from the
 * same fetch. Same shape as `usePayments`/`useCustomerPayments`.
 */
export function useServices({ enabled = true } = {}) {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await listServices();
      setServices(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Swap one service for the server's updated copy without a refetch — a
  // refetch shows the loading spinner in place of the grid, which unmounts
  // every card and would collapse an expanded subtask list on each tick.
  const replaceService = useCallback((updated) => {
    setServices((current) => current.map((one) => (one._id === updated._id ? updated : one)));
  }, []);

  return { services, isLoading, error, refetch, replaceService };
}

export default useServices;
