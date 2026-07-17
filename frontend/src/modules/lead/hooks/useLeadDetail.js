import { useCallback, useEffect, useState } from "react";
import { getLead, getLeadCallHistory } from "../api/leadApi";

/**
 * Fetches one lead plus its call history (there is no separate "activity
 * timeline" endpoint — see LeadDetailDrawer.jsx for how the timeline is
 * assembled from this same data). Exposes `refetch` so mutations elsewhere
 * (status change, hot toggle, log call, edit) can pull the updated record
 * without each caller re-implementing the fetch.
 */
export function useLeadDetail(leadId) {
  const [lead, setLead] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [leadResponse, callsResponse] = await Promise.all([
        getLead(leadId),
        getLeadCallHistory(leadId),
      ]);
      setLead(leadResponse.data.data);
      setCallHistory(callsResponse.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { lead, callHistory, isLoading, error, refetch, setLead };
}

export default useLeadDetail;
