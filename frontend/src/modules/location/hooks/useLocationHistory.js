import { useCallback, useEffect, useState } from "react";
import { fetchLocationHistory } from "../api/locationApi";

/**
 * `GET /location/history?employeeId=&date=` (§7.4b) — fetched on demand
 * whenever the selected employee/date changes, not polled (history is a
 * fixed, already-past day, unlike the live view).
 */
export function useLocationHistory({ employeeId, date }) {
  const [pings, setPings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchLocationHistory({ employeeId, date });
      const payload = response.data.data;

      // §7.67 changed this endpoint's shape from a flat ping array to
      // `{ endpoints, pings, ... }`. The array form is still accepted because
      // frontend and backend do not deploy atomically here — a browser holding
      // the new bundle can briefly talk to the old server, and a map that
      // throws is worse than one that shows the trail without endpoints.
      setPings(Array.isArray(payload) ? payload : payload?.pings || []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, date]);

  useEffect(() => {
    if (employeeId && date) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, date]);

  return { pings, isLoading, error, refetch };
}

export default useLocationHistory;
