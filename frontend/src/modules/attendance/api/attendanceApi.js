import apiClient from "../../../services/apiClient";

/**
 * Thin wrappers over the shared apiClient for every backend Attendance
 * endpoint (`.context/final-plan.md` §7.4 /
 * `backend/src/modules/attendance/attendance.routes.js`). No logic lives
 * here — just the HTTP calls, matching the `lead`/`customer` modules'
 * `api/*Api.js` pattern.
 *
 * `photo` is always sent as a base64 data URI string in the JSON body
 * (the backend also accepts multipart, but a data URI needs no `FormData`
 * plumbing and is the simplest correct choice for a canvas-captured
 * snapshot, which is already a data URI from `canvas.toDataURL()`).
 */

export function checkIn({ coords, photo }) {
  return apiClient.post("/attendance/check-in", { coords, photo });
}

export function checkOut({ coords, photo }) {
  return apiClient.post("/attendance/check-out", { coords, photo });
}

// Break In/Out (§7.4c) — no photo, unlike check-in/check-out.
export function breakIn({ coords }) {
  return apiClient.post("/attendance/break-in", { coords });
}

export function breakOut({ coords }) {
  return apiClient.post("/attendance/break-out", { coords });
}

// Fired repeatedly by `useCheckedInHeartbeatLoop` while checked in — see
// that hook for the interval/reasoning. No body needed: the backend derives
// "which shift" from the authenticated user's own open Attendance record.
export function heartbeat() {
  return apiClient.post("/attendance/heartbeat");
}

export function getMyAttendance(month) {
  return apiClient.get("/attendance/me", { params: { month } });
}

export function getTeamAttendance(month) {
  return apiClient.get("/attendance/team", { params: { month } });
}

// --- Admin manual correction (§7.4 addition) — admin-only server-side,
// same as `POST /payroll/run`'s plain role gate (no `attendance.*`
// permission tier covers editing, only viewing). ---

export function adjustAttendance(id, payload) {
  return apiClient.patch(`/attendance/${id}`, payload);
}

export function createManualAttendance(payload) {
  return apiClient.post("/attendance/manual", payload);
}
