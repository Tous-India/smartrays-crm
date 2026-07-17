import { useCallback, useEffect, useState } from "react";
import { listLeads } from "../api/leadApi";

/**
 * Fetches the lead list for the current filter set. Refetches whenever
 * `filters` changes (by value, via the JSON.stringify dependency below —
 * filters is a small flat object of strings, so this is cheap and avoids
 * every caller having to memoize the object itself).
 */
export function useLeads(filters) {
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const filtersKey = JSON.stringify(filters);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listLeads(filters);
      setLeads(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { leads, isLoading, error, refetch, setLeads };
}

export default useLeads;
