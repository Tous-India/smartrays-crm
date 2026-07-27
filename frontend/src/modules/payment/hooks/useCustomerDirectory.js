import { useEffect, useState } from "react";
import { listCustomers } from "../../customer/api/customerApi";

/**
 * A lightweight customer directory for resolving a payment's `customerId`
 * to a company name — deliberately NOT the Customers module's own
 * `useCustomers` hook, which also fetches every returned customer's
 * contracts (for the Customers List's type badges), N+1 requests this page
 * has no use for. Mirrors `useUserDirectory`'s minimal shape instead.
 * `listCustomers({})` with no `status` filter returns both active and
 * inactive customers, so a payment against a since-deactivated customer
 * still resolves to a real name.
 */
export function useCustomerDirectory() {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    listCustomers({}).then((response) => {
      if (isMounted) {
        setCustomers(response.data.data);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return { customers, isLoading };
}

export default useCustomerDirectory;
