import { useEffect, useState } from "react";
import { getLeaveBalance } from "../api/leaveApi";

/**
 * `GET /leave/balance` as a hook — `employeeId` omitted fetches the caller's
 * own balance (always allowed); passed, an employee on the caller's team or,
 * for an admin, anyone. Refetches whenever `employeeId` changes.
 */
export function useLeaveBalance(employeeId) {
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getLeaveBalance(employeeId)
      .then((response) => {
        if (!cancelled) {
          setBalance(response.data.data);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  return { balance, isLoading };
}

export default useLeaveBalance;
