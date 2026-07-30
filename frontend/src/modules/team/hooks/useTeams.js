import { useCallback, useEffect, useState } from "react";
import { listTeams } from "../api/teamApi";

/**
 * No filters/pagination, unlike `usePayments` — Teams is a small,
 * infrequently-changing admin-facing org-structure list (team.service.js's
 * own comment on `listTeams` makes the same "not a high-volume list" call),
 * so a plain fetch-on-mount + manual `refetch` is all this needs.
 */
export function useTeams() {
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await listTeams();
      setTeams(response.data.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { teams, isLoading, refetch };
}

export default useTeams;
