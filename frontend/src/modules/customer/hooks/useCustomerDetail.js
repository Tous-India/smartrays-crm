import { useCallback, useEffect, useState } from "react";
import { getCustomer, listContacts, listContracts, listActivity } from "../api/customerApi";

/**
 * Fetches everything the Customer Detail Page needs in one place — the
 * customer record plus contacts/contracts/activity, all in parallel — and
 * exposes a single `refetch` so any mutation anywhere on the page (edit,
 * add/remove contract, add/remove contact) can refresh the whole page's
 * state the same way `useLeadDetail` does for Leads.
 *
 * Deliberately does NOT fetch credentials — the Credentials Vault UI was
 * removed from this page (see `CustomerDetailContent.jsx`'s own comment);
 * `listCredentials`/`revealCredential` etc. remain in `customerApi.js`
 * unused, easy to re-wire if this ever comes back, but no page currently
 * calls them.
 */
export function useCustomerDetail(customerId) {
  const [customer, setCustomer] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [customerRes, contactsRes, contractsRes, activityRes] = await Promise.all([
        getCustomer(customerId),
        listContacts(customerId),
        listContracts(customerId),
        listActivity(customerId),
      ]);

      setCustomer(customerRes.data.data);
      setContacts(contactsRes.data.data);
      setContracts(contractsRes.data.data);
      setActivity(activityRes.data.data);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { customer, contacts, contracts, activity, isLoading, error, refetch };
}

export default useCustomerDetail;
