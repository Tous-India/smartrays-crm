import { useEffect, useState } from "react";
import { getLeadSources } from "../api/leadApi";

/**
 * `GET /lead-sources` — the configurable source list (Meta Ads, Website,
 * Referral, ...), lazily seeded server-side on first fetch. Read once per
 * mount; nothing in this app edits sources yet, so no refetch is exposed.
 */
export function useLeadSources() {
  const [sources, setSources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    getLeadSources().then((response) => {
      if (isMounted) {
        setSources(response.data.data);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return { sources, isLoading };
}

export default useLeadSources;
