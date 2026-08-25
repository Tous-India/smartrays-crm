import { useEffect, useState } from "react";
import { fetchLocationHistoryRange } from "../api/locationApi";

/**
 * The history map's data source (§7.67). One request returns both halves —
 * endpoints (no TTL, from Attendance) and pings (45-day TTL, from
 * LocationPing) — already scoped and already capped server-side.
 */
export function useLocationHistoryRange({ employeeIds, from, to, enabled = true }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchLocationHistoryRange({ employeeIds, from, to })
      .then((response) => {
        if (!cancelled) {
          setData(response.data.data);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError);
          setData(null);
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
  }, [employeeIds, from, to, enabled]);

  return { data, isLoading, error };
}

export default useLocationHistoryRange;
