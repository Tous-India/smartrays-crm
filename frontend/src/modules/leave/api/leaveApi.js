import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for every backend Leave endpoint
 * (`.context/final-plan.md` §7.5 / `backend/src/modules/leave/leave.routes.js`).
 */

export function requestLeave(payload) {
  return apiClient.post("/leave/request", payload);
}

export function listLeave(scope) {
  return apiClient.get("/leave", { params: { scope } });
}

export function approveLeave(id) {
  return apiClient.patch(`/leave/${id}/approve`);
}

export function markUnapprovedAbsence(id) {
  return apiClient.patch(`/leave/${id}/mark-unapproved-absence`);
}
