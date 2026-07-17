import { useEffect, useState } from "react";
import { fetchUserDropdown } from "../services/userDirectoryApi";

/**
 * `GET /users/dropdown` as a hook — shared across modules (Leads' owner
 * filter, Convert-to-Customer's project manager picker, and any future
 * "assign to" picker). Lives in the shared `src/hooks/` folder rather than
 * under a single module, matching §9's "shared hook" placement rule.
 */
export function useUserDirectory() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    fetchUserDropdown().then((response) => {
      if (isMounted) {
        setUsers(response.data.data);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return { users, isLoading };
}

export default useUserDirectory;
