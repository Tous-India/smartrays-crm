import { useCallback, useEffect, useState } from "react";
import { listCustomerPayments } from "../api/customerApi";

/**
 * One customer's payments for the detail page's Payments section (§7.70).
 *
 * Deliberately its OWN hook rather than a fifth request inside
 * `useCustomerDetail`: recording a payment must refresh this list and nothing
 * else, and `useCustomerDetail.refetch` re-fetches the whole page. Same shape
 * as `usePayments` minus pagination — a single customer's history is small.
 */
export function useCustomerPayments(customerId) {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!customerId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await listCustomerPayments(customerId);
      setPayments(response.data.data.items);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { payments, isLoading, error, refetch };
}

export default useCustomerPayments;
