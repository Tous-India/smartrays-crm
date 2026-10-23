import { useEffect, useState } from "react";
import { getLocationConfig } from "../../tracking/locationApi";
import { FALLBACK_META, metaFrom } from "../live.utils";

let cached = null;

/** The status names and colours from GET /location/config — read once and shared. */
export default function useLiveMeta() {
  const [meta, setMeta] = useState(cached || FALLBACK_META);

  useEffect(() => {
    if (cached) return undefined;
    let cancelled = false;
    getLocationConfig()
      .then((response) => {
        cached = metaFrom(response.data.data.statuses);
        if (!cancelled) setMeta(cached);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return meta;
}
