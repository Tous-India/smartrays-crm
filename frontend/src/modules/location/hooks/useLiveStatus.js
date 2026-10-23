import { useCallback, useEffect, useState } from "react";
import { fetchLiveStatus, fetchLocationConfig } from "../api/locationApi";

const POLL_MS = 45000;

/**
 * Live employee status (2026-10-23): GET /location/live-status every 45 s and
 * when the tab comes back into view, plus the status names and colours from
 * GET /location/config (the same list the app uses).
 */
export default function useLiveStatus() {
  const [live, setLive] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchLiveStatus();
      setLive(response.data.data);
      setError(null);
    } catch (loadError) {
      setError(loadError);
    }
  }, []);

  useEffect(() => {
    fetchLocationConfig()
      .then((response) => setStatuses(response.data.data.statuses || []))
      .catch(() => setStatuses([]));
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { live, statuses, error, reload: load };
}
