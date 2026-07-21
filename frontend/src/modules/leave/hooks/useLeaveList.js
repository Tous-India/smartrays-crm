import { useCallback, useEffect, useState } from "react";
import { listLeave } from "../api/leaveApi";

/**
 * `GET /leave?scope=own|team|all` as a hook — refetches whenever `scope`
 * changes, matching the `useCustomers`/`useLeads` shape.
 */
export function useLeaveList(scope) {
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listLeave(scope);
      setLeaveRequests(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { leaveRequests, isLoading, error, refetch };
}

export default useLeaveList;
