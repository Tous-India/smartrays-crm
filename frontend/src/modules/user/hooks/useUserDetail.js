import { useCallback, useEffect, useState } from "react";
import { getUser } from "../api/userApi";

/**
 * The one blocking fetch the User Detail page needs before it can render
 * anything at all (the Header and Basic Info card both derive directly from
 * this same record) — mirrors `useCustomerDetail`'s shape for the "core
 * entity" fetch. Every other section on the page (Attendance/Leave/Team/
 * Leads/Permissions/Payroll) fetches independently instead of being bundled
 * in here, so one of THOSE failing never blocks the page shell itself —
 * see each section card's own hook/component for that.
 */
export function useUserDetail(userId) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getUser(userId);
      setUser(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { user, isLoading, error, refetch };
}

export default useUserDetail;
