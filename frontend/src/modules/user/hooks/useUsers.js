import { useCallback, useEffect, useState } from "react";
import { listUsers } from "../api/userApi";

/**
 * Fetches the user roster for the current filter set — scoping (admin sees
 * everyone, manager sees their own team) is entirely server-side
 * (`user.service.js#resolveVisibleUserFilter`), this hook just refetches
 * whenever `filters` changes, same pattern as the Leads module's `useLeads`.
 */
export function useUsers(filters) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const filtersKey = JSON.stringify(filters);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listUsers(filters);
      setUsers(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { users, isLoading, error, refetch };
}

export default useUsers;
