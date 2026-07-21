import { useCallback, useEffect, useState } from "react";
import { fetchLiveLocations } from "../api/locationApi";

// Just a reasonable value within this task's stated "~10-15 seconds"
// auto-refresh range — not read from the backend's own
// `LOCATION_PING_INTERVAL_MINUTES` (that config is for how often a client
// SUBMITS a ping, a different cadence than how often this view re-polls
// to display them).
const POLL_INTERVAL_MS = 12000;

/**
 * `GET /location/live` (§7.4b), re-polled on an interval so the map view
 * stays roughly current without the user manually refreshing. Scoping
 * (own/team/all) is entirely server-side — this hook just re-fetches
 * whatever the backend decides this user can see.
 */
export function useLiveLocations() {
  const [liveLocations, setLiveLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    try {
      const response = await fetchLiveLocations();
      setLiveLocations(response.data.data);
      setError(null);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [refetch]);

  return { liveLocations, isLoading, error, refetch };
}

export default useLiveLocations;
