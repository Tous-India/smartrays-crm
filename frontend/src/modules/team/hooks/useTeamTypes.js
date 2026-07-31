import { useEffect, useState } from "react";
import { getTeamTypes } from "../api/teamApi";

/**
 * `GET /team-types` (§7.30) — the admin-managed team type list, lazily
 * seeded server-side on first fetch. Mirrors `useLeadSources.js` exactly:
 * read once per mount, no refetch exposed — nothing in this app's frontend
 * edits team types yet (backend CRUD exists and is tested, but per this
 * task's own instruction not to build more UI than the equivalent LeadSource
 * feature has, there's no admin management screen for it).
 */
export function useTeamTypes() {
  const [types, setTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    getTeamTypes().then((response) => {
      if (isMounted) {
        setTypes(response.data.data);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return { types, isLoading };
}

export default useTeamTypes;
