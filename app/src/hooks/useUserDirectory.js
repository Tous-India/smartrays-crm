import { useEffect, useMemo, useState } from "react";
import { getUserDirectory } from "../api/userApi";

/**
 * Names for ids (assigned by, completed by, manager), from the same
 * `GET /users/dropdown` the web's directory hook reads. Fetched once per
 * mount; a failure leaves the map empty and the screen shows ids' rows
 * without a name rather than failing — names are decoration here, the
 * record is the thing.
 */
let cachedUsers = null;

function useUserDirectory() {
  const [users, setUsers] = useState(cachedUsers || []);

  useEffect(() => {
    if (cachedUsers) {
      return;
    }

    let cancelled = false;

    getUserDirectory()
      .then((response) => {
        cachedUsers = response.data.data;

        if (!cancelled) {
          setUsers(cachedUsers);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const nameById = useMemo(() => new Map(users.map((user) => [user._id, user.name])), [users]);

  return { users, nameById };
}

/** Tests and sign-out: forget the cached directory. */
export function clearUserDirectoryCache() {
  cachedUsers = null;
}

export default useUserDirectory;
