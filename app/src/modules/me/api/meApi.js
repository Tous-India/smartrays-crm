import ReactNativeBlobUtil from "react-native-blob-util";
import Config from "react-native-config";
import apiClient from "../../../api/apiClient";
import { API_PATHS } from "../../../constants/api.constants";
import { getAccessToken } from "../../../store/tokenStorage";

/**
 * The Me tab's endpoints — the web's own, over Bearer auth. The profile
 * itself is the session user (`GET /auth/me`, already in the store); the
 * team names the manager and the department.
 */

/** `GET /teams/mine` — the caller's team `{ name, type, head, members }`, or null without a manager. */
export function getMyTeam() {
  return apiClient.get(API_PATHS.MY_TEAM);
}

/** `GET /payroll?scope=own` — the caller's payroll records, newest month first, every status. */
export function listMyPayroll() {
  return apiClient.get(API_PATHS.PAYROLL, { params: { scope: "own" } });
}

/**
 * `GET /payroll/:id/payslip` — the PDF, saved to the app's cache and handed
 * to whatever on the phone opens PDFs. Fetched with the blob library rather
 * than the JSON client because the answer is a file, not JSON. The bearer
 * token is the in-memory one; `refreshAccessToken` runs first so an expired
 * token is renewed the same way any other request's would be.
 */
export async function openPayslip(payrollId, fileName) {
  await refreshAccessToken();

  const url = `${Config.API_BASE_URL}${API_PATHS.PAYROLL}/${payrollId}/payslip`;
  const response = await ReactNativeBlobUtil.config({
    fileCache: true,
    appendExt: "pdf",
    path: `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`,
  }).fetch("GET", url, { Authorization: `Bearer ${getAccessToken()}` });

  const status = response.info().status;

  if (status !== 200) {
    // The body is the server's JSON error — surface its message as the
    // JSON client would have.
    let message = `Could not download the payslip (${status}).`;

    try {
      message = JSON.parse(await response.text()).message || message;
    } catch (parseError) {
      // Not JSON; keep the status line.
    }

    const error = new Error(message);
    error.response = { status, data: { message } };
    throw error;
  }

  await ReactNativeBlobUtil.android.actionViewIntent(response.path(), "application/pdf");
}

/**
 * A no-op request through the JSON client: its interceptor refreshes an
 * expired access token and stores the new one, so the download that
 * follows carries a live token.
 */
async function refreshAccessToken() {
  await apiClient.get(API_PATHS.CURRENT_USER);
}
