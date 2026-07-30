import { useCallback, useEffect, useState } from "react";
import { listTeams } from "../api/teamApi";

/**
 * No pagination, unlike `usePayments` — Teams is a small, infrequently-
 * changing admin-facing org-structure list (team.service.js's own comment
 * on `listTeams` makes the same "not a high-volume list" call). `filters`
 * (`type`/`isActive`, §7.28) is optional — every existing caller that just
 * wants the full unfiltered list (the Department picker in User Management/
 * the New User form) keeps working unchanged by simply omitting it.
 */
export function useTeams(filters) {
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const filtersKey = JSON.stringify(filters);

  const refetch = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await listTeams(filters);
      setTeams(response.data.data);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { teams, isLoading, refetch };
}

export default useTeams;
