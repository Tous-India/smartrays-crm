import apiClient from "./apiClient";

/**
 * `POST /reports/generate` — the unified §7.11 dispatcher, shared across
 * every module that offers a report download (Attendance, Leave, and later
 * Payroll/Transport/Leads/Customers). Lives here rather than under a single
 * module's `api/` folder because it isn't specific to any one of them — the
 * same shared-endpoint reasoning `userDirectoryApi.js` already documents.
 *
 * Response shape is `{ downloadUrl }` (a Cloudinary URL), never a streamed
 * file — the caller triggers a download via `triggerFileDownload` below,
 * it does not need to handle a blob itself.
 */
export function generateReport({ module, filters, format }) {
  return apiClient.post("/reports/generate", { module, filters, format });
}

/**
 * Opens an already-hosted file URL (Cloudinary) in a way that downloads
 * rather than navigates the current tab — a synthetic `<a download>` click,
 * the same DOM-manipulation pattern `LeadsListPage.jsx#handleExport` already
 * uses for its blob export, minus the blob/object-URL part since this URL
 * is already real and hosted, not a same-origin blob this app created.
 */
export function triggerFileDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  if (filename) {
    link.download = filename;
  }
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
