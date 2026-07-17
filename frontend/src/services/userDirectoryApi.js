import apiClient from "./apiClient";

/**
 * `GET /users/dropdown` — the low-sensitivity `_id`/`name`/`role` picker list
 * (any authenticated role, no `users.*` grant needed), per
 * `backend/README.md`'s User Management section. Lives here rather than
 * under `src/modules/lead/` because it's a shared, cross-module endpoint —
 * the Leads owner filter and the Convert-to-Customer project manager picker
 * both use it today, and it isn't specific to either.
 */
export function fetchUserDropdown() {
  return apiClient.get("/users/dropdown");
}
