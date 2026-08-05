import { useCallback, useEffect, useState } from "react";
import { getMyAttendance } from "../api/attendanceApi";
import { subscribeToAttendanceChanges } from "../utils/attendanceEvents.js";

/**
 * Own attendance records for a given month (`GET /attendance/me?month=`) —
 * used both by the Personal Attendance timeline (a user-selected month) and
 * by `CheckInOutWidget` (always the current month, to derive whether a
 * shift is currently open). `openRecord` is the one record with no
 * `checkOut.time` yet — the backend only ever allows one at a time, so
 * finding it is enough to answer "am I checked in right now."
 */
export function useMyAttendance(month) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getMyAttendance(month);
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

  // Keeps every mounted instance consistent after a check-in/out performed
  // elsewhere (e.g. the header button while `/attendance` is open) — see
  // `utils/attendanceEvents.js` for why this isn't a shared store.
  useEffect(() => subscribeToAttendanceChanges(refetch), [refetch]);

  const openRecord = records.find((record) => !record.checkOut?.time) || null;

  return { records, openRecord, isLoading, error, refetch };
}

export default useMyAttendance;
