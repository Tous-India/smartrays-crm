import apiClient from "../../../api/apiClient";
import { API_PATHS } from "../../../constants/api.constants";

/**
 * The attendance endpoints the app uses — the web's own, over Bearer auth.
 *
 * Check-in and check-out go up as multipart/form-data: the photo as a file
 * part named `photo` and `coords` as a JSON string, which is the shape the
 * backend's `upload.single("photo")` + `extractCoords` already accept. The
 * web sends a base64 data URI in a JSON body instead; a file part is the
 * right transport for a real JPEG and avoids a 33% base64 inflation.
 */

/** `GET /attendance/me?month=YYYY-MM` — the caller's own records for a month. */
export function getMyAttendance(month) {
  return apiClient.get(API_PATHS.MY_ATTENDANCE, { params: { month } });
}

function buildCaptureForm({ coords, photoUri, fileName }) {
  const form = new FormData();

  form.append("photo", { uri: photoUri, name: fileName, type: "image/jpeg" });
  // `accuracy` rides along with lat/lng (mobile-backend-plan.md §3.6). The
  // server ignores it until that item lands; it never fails validation.
  form.append("coords", JSON.stringify(coords));

  return form;
}

// axios must not JSON-encode the body: an explicit multipart type makes the
// platform's XHR add the boundary and stream the file part.
const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

export function checkIn({ coords, photoUri }) {
  return apiClient.post(API_PATHS.CHECK_IN, buildCaptureForm({ coords, photoUri, fileName: "check-in.jpg" }), MULTIPART);
}

/**
 * `POST /attendance/heartbeat` — "the device reached the server", the signal
 * the server's connectivity-gap detection listens for (final-plan.md §6.5).
 * The web sends it on a timer; the app sends it each time a ping batch lands.
 */
export function heartbeat() {
  return apiClient.post(API_PATHS.HEARTBEAT);
}

export function checkOut({ coords, photoUri }) {
  return apiClient.post(API_PATHS.CHECK_OUT, buildCaptureForm({ coords, photoUri, fileName: "check-out.jpg" }), MULTIPART);
}
