import { useEffect, useState } from "react";
import { getLeaveBalance } from "../api/leaveApi";

/**
 * `GET /leave/balance` as a hook — `employeeId` omitted fetches the caller's
 * own balance (always allowed); passed, an employee on the caller's team or,
 * for an admin, anyone. Refetches whenever `employeeId` changes.
 *
 * `error` (added 2026-07-31, §7.32) — this hook previously had no `.catch()`
 * at all, unlike its sibling attendance hooks (`useMyAttendance`/
 * `useTeamAttendance`, both already return `error`) — a real failure left
 * `balance` stuck at `null` with no way for a caller to distinguish "still
 * loading" from "failed to load," and produced a genuine unhandled promise
 * rejection in the console. Found while building the User Detail page's own
 * Leave card, which needs a real error state to show through `WidgetCard`
 * the same way every other section on that page already does.
 */
export function useLeaveBalance(employeeId) {
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getLeaveBalance(employeeId)
      .then((response) => {
        if (!cancelled) {
          setBalance(response.data.data);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError);
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

  return { balance, isLoading, error };
}

export default useLeaveBalance;
