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

export function declineLeave(id, reason) {
  return apiClient.patch(`/leave/${id}/decline`, reason ? { reason } : {});
}

// `employeeId` omitted fetches the caller's own balance; passed, fetches an
// employee on the caller's team (manager) or anyone (admin) — see
// backend/src/modules/leave/leave.service.js#getLeaveBalance.
export function getLeaveBalance(employeeId) {
  return apiClient.get("/leave/balance", { params: employeeId ? { employeeId } : {} });
}
