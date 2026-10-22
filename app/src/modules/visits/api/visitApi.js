import apiClient from "../../../api/apiClient";
import { API_PATHS } from "../../../constants/api.constants";

/**
 * Verified site visits (2026-10-22). A visit sits behind a Service; the app
 * finds it by the service id. Arrived, photos and Done are judged by the
 * server against the site's geofence — the app sends the fix and shows the
 * answer, including a refusal, in the server's words.
 */

/** `GET /visits?serviceId=` → the visit behind this service, or none. */
export async function findVisitForService(serviceId) {
  const response = await apiClient.get(API_PATHS.VISITS, { params: { serviceId } });
  return response.data.data[0] || null;
}

export function getVisit(visitId) {
  return apiClient.get(`${API_PATHS.VISITS}/${visitId}`);
}

export function arriveAtVisit(visitId, coords) {
  return apiClient.post(`${API_PATHS.VISITS}/${visitId}/arrive`, { coords });
}

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

export function addVisitPhoto(visitId, { coords, photoUri, capturedAt }) {
  const form = new FormData();
  form.append("photo", { uri: photoUri, name: "site.jpg", type: "image/jpeg" });
  form.append("coords", JSON.stringify(coords));
  form.append("capturedAt", capturedAt);
  return apiClient.post(`${API_PATHS.VISITS}/${visitId}/photos`, form, MULTIPART);
}

export function completeVisit(visitId, { coords, notes }) {
  return apiClient.post(`${API_PATHS.VISITS}/${visitId}/complete`, { coords, notes });
}
