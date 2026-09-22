import { useEffect, useState } from "react";
import apiClient from "../api/apiClient";
import { API_PATHS } from "../constants/api.constants";

/**
 * What the server says this user may do (`GET /users/me/permissions`,
 * app-plan.md §3.1) — read once per session and shared, so a screen can hide
 * a control the server would refuse anyway. The server's gate is the real
 * one; this only spares the user a button that ends in a 403. Until the
 * answer arrives `permissions` is null and callers treat every check as
 * "not yet".
 */
let cached = null;
let inFlight = null;

function loadPermissions() {
  if (!inFlight) {
    inFlight = apiClient
      .get(API_PATHS.MY_PERMISSIONS)
      .then((response) => {
        cached = response.data.data;
        return cached;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

function useMyPermissions() {
  const [result, setResult] = useState(cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cached) {
      return;
    }

    let cancelled = false;

    loadPermissions()
      .then((value) => {
        if (!cancelled) {
          setResult(value);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { role: result?.role || null, permissions: result?.permissions || null, error };
}

/** `can(permissions, "services", "create")` — false until the permissions have loaded. */
export function can(permissions, moduleName, action) {
  return Boolean(permissions?.[moduleName]?.[action]);
}

/** Any of several actions — the `view_team` / `view_all` ladder. */
export function canAny(permissions, moduleName, actions) {
  return actions.some((action) => can(permissions, moduleName, action));
}

/** Sign-out and tests: forget the cached answer. */
export function clearPermissionsCache() {
  cached = null;
}

export default useMyPermissions;
