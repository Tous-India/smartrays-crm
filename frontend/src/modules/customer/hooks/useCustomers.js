import { useCallback, useEffect, useState } from "react";
import { listCustomers, listContracts } from "../api/customerApi";

/**
 * Fetches the customer list for the current filter set, refetching whenever
 * `filters` changes — same shape as the lead module's `useLeads`.
 *
 * `GET /customers` returns bare Customer documents with no embedded
 * contracts, but the List View's "Type badges" column (Monthly/One-time/
 * Yearly, per the functional spec) needs each customer's contract types.
 * There's no joined "customers with contract types" endpoint on the
 * backend, so this fetches every visible customer's contracts in parallel
 * after the list resolves and attaches the derived, real (not faked) type
 * set onto each row as `contractTypes`. `isLoadingContractTypes` is tracked
 * separately so the table can render immediately and fill in badges once
 * they arrive, rather than blocking the whole list on N extra requests.
 */
export function useCustomers(filters) {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingContractTypes, setIsLoadingContractTypes] = useState(false);
  const [error, setError] = useState(null);

  const filtersKey = JSON.stringify(filters);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listCustomers(filters);
      const fetchedCustomers = response.data.data;
      setCustomers(fetchedCustomers);
      setIsLoading(false);

      setIsLoadingContractTypes(true);
      const contractLists = await Promise.all(
        fetchedCustomers.map((customer) =>
          listContracts(customer._id).then((contractResponse) => contractResponse.data.data)
        )
      );
      setCustomers(
        fetchedCustomers.map((customer, index) => ({
          ...customer,
          contractTypes: [...new Set(contractLists[index].map((contract) => contract.type))],
        }))
      );
    } catch (fetchError) {
      setError(fetchError);
      setIsLoading(false);
    } finally {
      setIsLoadingContractTypes(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { customers, isLoading, isLoadingContractTypes, error, refetch };
}

export default useCustomers;
