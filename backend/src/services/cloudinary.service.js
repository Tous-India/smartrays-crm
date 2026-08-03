import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

/**
 * Uploads a check-in/check-out photo to Cloudinary and returns both the
 * secure URL and the asset's `public_id` — the binary itself is never stored
 * in MongoDB, only these two values (Attendance.checkIn/checkOut's
 * `photoUrl`/`photoPublicId`, §6.5/§7.4/§7.4c). Accepts either a base64 data
 * URI string (JSON body) or a raw Buffer (multipart upload via multer) —
 * attendance.controller.js normalizes both shapes into whatever this
 * function receives.
 *
 * `public_id` is returned (2026-07-31, §7.4c) alongside the URL — added
 * specifically so `attendancePhotoCleanupCron.js` can later delete the
 * actual Cloudinary asset via `deleteCloudinaryAsset` below; `secure_url`
 * alone doesn't identify an asset for deletion. Every OTHER caller of this
 * function still only ever needs `secureUrl`.
 */
export async function uploadAttendancePhoto(photoInput) {
  const uploadSource = Buffer.isBuffer(photoInput)
    ? `data:image/jpeg;base64,${photoInput.toString("base64")}`
    : photoInput;

  const result = await cloudinary.uploader.upload(uploadSource, {
    folder: "smartrays/attendance",
    resource_type: "image",
  });

  return { secureUrl: result.secure_url, publicId: result.public_id };
}

/**
 * Deletes a single asset from Cloudinary by its `public_id` — used by
 * `attendancePhotoCleanupCron.js` (§7.4c) to actually free the stored photo
 * once a record is old enough, not just clear the DB's reference to it.
 * Callers are expected to handle their own try/catch per-asset (the cron
 * must survive one asset's failure without stopping the whole batch) — this
 * function itself doesn't swallow errors, so a real failure is still visible
 * to whoever calls it.
 */
export async function deleteCloudinaryAsset(publicId) {
  return cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}

/**
 * Uploads a Ticket attachment and returns the secure URL (§6.6/§7.8) — reuses
 * this module's shared `cloudinary` client/config rather than duplicating
 * the upload boilerplate `uploadAttendancePhoto` above already has. Unlike
 * attendance photos, ticket attachments aren't guaranteed to be images (could
 * be a PDF, a log file, etc.), so `resource_type: "auto"` lets Cloudinary
 * detect the actual type instead of hardcoding `"image"`.
 */
export async function uploadTicketAttachment(fileInput) {
  const uploadSource = Buffer.isBuffer(fileInput)
    ? `data:application/octet-stream;base64,${fileInput.toString("base64")}`
    : fileInput;

  const result = await cloudinary.uploader.upload(uploadSource, {
    folder: "smartrays/tickets",
    resource_type: "auto",
  });

  return result.secure_url;
}

const REPORT_MIME_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * Uploads a generated report buffer (from `src/services/report.service.js`'s
 * `generateExcelReport`/`generatePdfReport`) and returns the secure URL —
 * §7.11's "upload to Cloudinary, return a download URL" behavior. Always a
 * real `Buffer` (never a base64 string) since it always comes straight from
 * `exceljs`/`pdfkit`, unlike the other upload functions here which also
 * accept a client-supplied base64 data URI.
 */
export async function uploadReportFile(buffer, format) {
  const mimeType = REPORT_MIME_TYPES[format] || "application/octet-stream";
  const uploadSource = `data:${mimeType};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(uploadSource, {
    folder: "smartrays/reports",
    resource_type: "auto",
  });

  return result.secure_url;
}
