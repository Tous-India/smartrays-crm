import apiClient from "../../../services/apiClient";

/** Verified site visits (2026-10-22) — /visits. Scope is the server's (Services rules). */
export function listVisits(date) {
  return apiClient.get("/visits", { params: { date } });
}

export function getVisit(id) {
  return apiClient.get(`/visits/${id}`);
}

export function createVisit(payload) {
  return apiClient.post("/visits", payload);
}

/** Customers the caller may send someone to (owner or project manager in their team). */
export function listVisitCustomers() {
  return apiClient.get("/visits/customer-options");
}

/** Who the caller may assign work to — the Services picker (services.create). */
export function listVisitAssignees() {
  return apiClient.get("/services/assignees");
}

/**
 * Finds an address on OpenStreetMap (Nominatim) — free, no key, light use
 * only (one search per click). Returns { lat, lng, label } or null.
 */
export async function findAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const [first] = await response.json();
  return first ? { lat: Number(first.lat), lng: Number(first.lon), label: first.display_name } : null;
}
