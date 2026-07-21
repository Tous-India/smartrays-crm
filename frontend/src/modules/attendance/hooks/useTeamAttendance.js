import { useCallback, useEffect, useState } from "react";
import { getTeamAttendance } from "../api/attendanceApi";

/**
 * A manager's/admin's team attendance for a given month
 * (`GET /attendance/team?month=`) — same shape as `useMyAttendance`, just a
 * different endpoint. The backend has no `employeeId` filter on this
 * endpoint, so `TeamAttendanceView`'s employee selector filters the already-
 * fetched records client-side rather than re-fetching per employee.
 */
export function useTeamAttendance(month) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getTeamAttendance(month);
      setRecords(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { records, isLoading, error, refetch };
}

export default useTeamAttendance;
