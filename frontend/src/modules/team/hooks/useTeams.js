import { useCallback, useEffect, useState } from "react";
import { listTeams } from "../api/teamApi";

/**
 * No pagination, unlike `usePayments` — Teams is a small, infrequently-
 * changing admin-facing org-structure list (team.service.js's own comment
 * on `listTeams` makes the same "not a high-volume list" call). `filters`
 * (`type`/`isActive`, §7.28) is optional — every existing caller that just
 * wants the full unfiltered list (the Department picker in User Management/
 * the New User form) keeps working unchanged by simply omitting it.
 */
export function useTeams(filters, { enabled = true } = {}) {
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const filtersKey = JSON.stringify(filters);

  const refetch = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await listTeams(filters);
      setTeams(response.data.data);
    } catch {
      // Never rethrow (fixed 2026-08-09). There was no catch at all, so a 403
      // from `GET /teams` — which every non-manager gets, and which an
      // employee hit through LeaveSection — surfaced as an unhandled promise
      // rejection in the console rather than being handled anywhere.
      //
      // Teams are only ever a filter/label here, so degrading to "no teams"
      // costs a dropdown option; letting it throw costs a clean console and
      // hides real errors among the noise.
      setTeams([]);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, enabled]);

  useEffect(() => {
    // `enabled: false` means don't ask at all — better than asking and
    // swallowing a 403 the caller already knew was coming.
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    refetch();
  }, [refetch, enabled]);

  return { teams, isLoading, refetch };
}

export default useTeams;
