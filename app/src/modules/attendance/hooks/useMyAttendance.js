import { useCallback, useEffect, useState } from "react";
import { getMyAttendance } from "../api/attendanceApi";
import { findOpenRecord, findTodayRecord, monthKey } from "../attendance.utils";

/**
 * The caller's own records for the current month (`GET /attendance/me`),
 * and the two records the shift card is about: the open one, if any, and
 * today's latest. The same source the web header reads — the app derives
 * "am I checked in" from this record and nothing else (final-plan.md §7.71).
 */
function useMyAttendance() {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setError(null);

    try {
      const response = await getMyAttendance(monthKey());
      setRecords(response.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    records,
    openRecord: findOpenRecord(records),
    todayRecord: findTodayRecord(records),
    isLoading,
    error,
    refetch,
  };
}

export default useMyAttendance;
