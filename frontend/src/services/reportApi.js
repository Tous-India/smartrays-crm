import apiClient from "./apiClient";

/**
 * `POST /reports/generate` — the unified §7.11 dispatcher, shared across
 * every module that offers a report download (Leads, Customers, Attendance,
 * Leave, Payroll, Transport). Lives here rather than under a single module's
 * `api/` folder because it isn't specific to any one of them — the same
 * shared-endpoint reasoning `userDirectoryApi.js` already documents.
 *
 * The response is the generated file itself, streamed directly (2026-08-04
 * — Cloudinary's upload step was removed; see `triggerBlobDownload` below
 * for how the caller turns this into a browser download).
 * `responseType: "blob"` is required so axios doesn't try to parse the
 * binary body as JSON/text.
 */
export function generateReport({ module, filters, format }) {
  return apiClient.post("/reports/generate", { module, filters, format }, { responseType: "blob" });
}

/**
 * Triggers a browser download from an in-memory `Blob` (the direct-stream
 * report response) — object URL → hidden `<a download>` click → revoke,
 * the same DOM-manipulation pattern `LeadsListPage.jsx#handleExport` already
 * uses for its own blob export.
 */
export function triggerBlobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
