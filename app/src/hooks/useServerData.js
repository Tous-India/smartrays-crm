import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

/**
 * One request's lifecycle for a screen: load once, reload every time the
 * screen regains focus (a change made elsewhere shows up on return), and
 * reload on demand (pull-to-refresh, "Try again").
 *
 *   isLoading    — true only until the FIRST answer; the list-state spinner
 *   isRefreshing — a later reload in progress; the pull-to-refresh spinner
 *   error        — the last failure, cleared by the next successful load
 *   data         — whatever `load` resolved to; `initialData` until then
 *
 * `load` is called with nothing and must return the data (not the axios
 * response). It is captured in a ref, so callers may pass an inline
 * function; pass `deps` for the values that should trigger a fresh load
 * (a month key, a status filter).
 */
function useServerData(load, { initialData = null, deps = [] } = {}) {
  const [data, setData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const loadRef = useRef(load);
  const hasLoadedRef = useRef(false);

  loadRef.current = load;

  const run = useCallback(async (mode) => {
    if (mode === "refresh") {
      setIsRefreshing(true);
    }

    try {
      const result = await loadRef.current();
      setData(result);
      setError(null);
    } catch (loadError) {
      setError(loadError);
    } finally {
      hasLoadedRef.current = true;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // A dependency change means the current data is for something else: show
  // the first-load spinner again rather than stale rows.
  useEffect(() => {
    hasLoadedRef.current = false;
    setIsLoading(true);
    run("load");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedRef.current) {
        run("silent");
      }
    }, [run])
  );

  const refetch = useCallback(() => run("refresh"), [run]);

  return { data, isLoading, isRefreshing, error, refetch };
}

export default useServerData;
