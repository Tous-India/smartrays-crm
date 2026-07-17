import { useCallback, useEffect, useState } from "react";
import {
  getCustomer,
  listContacts,
  listContracts,
  listCredentials,
  listActivity,
} from "../api/customerApi";

/**
 * Fetches everything the Customer Detail Page needs in one place — the
 * customer record plus contacts/contracts/credentials/activity, all in
 * parallel — and exposes a single `refetch` so any mutation anywhere on the
 * page (edit, add/remove contract, add/remove contact, credential
 * add/edit/remove) can refresh the whole page's state the same way
 * `useLeadDetail` does for Leads. Credentials here are always the masked
 * list shape (`passwordEncrypted`/`passwordIv` are `select: false` on the
 * backend) — reveal is a separate, explicit, audited call
 * (`revealCredential`), never bundled into this fetch.
 */
export function useCustomerDetail(customerId) {
  const [customer, setCustomer] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [activity, setActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [customerRes, contactsRes, contractsRes, credentialsRes, activityRes] =
        await Promise.all([
          getCustomer(customerId),
          listContacts(customerId),
          listContracts(customerId),
          listCredentials(customerId),
          listActivity(customerId),
        ]);

      setCustomer(customerRes.data.data);
      setContacts(contactsRes.data.data);
      setContracts(contractsRes.data.data);
      setCredentials(credentialsRes.data.data);
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

  return { customer, contacts, contracts, credentials, activity, isLoading, error, refetch };
}

export default useCustomerDetail;
