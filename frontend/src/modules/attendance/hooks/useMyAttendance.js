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

  // An open shift needs a real CHECK-IN, not merely the absence of a
  // check-out (fixed 2026-08-09).
  //
  // This used to be `!record.checkOut?.time` alone. That held while every
  // record an employee had came from their own device, but §7.4g introduced
  // records with checkIn.time AND checkOut.time both null — manual roster
  // marks and leave-approval records. Those matched, so the header announced
  // "Checked In / Tracking active" and computed an elapsed time from a null
  // check-in, rendering NaN:NaN:NaN.
  //
  // The false "tracking active" was the worse half: a manual mark has no
  // check-in moment, nothing is being tracked, and the check-out and break
  // controls keyed off the same flag.
  const openRecord = records.find((record) => record.checkIn?.time && !record.checkOut?.time) || null;

  return { records, openRecord, isLoading, error, refetch };
}

export default useMyAttendance;
