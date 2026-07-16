import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

/**
 * Uploads a check-in/check-out photo to Cloudinary and returns the secure
 * URL — the binary itself is never stored in MongoDB, only this URL
 * (Attendance.checkIn.photoUrl / checkOut.photoUrl, §6.5/§7.4). Accepts
 * either a base64 data URI string (JSON body) or a raw Buffer (multipart
 * upload via multer) — attendance.controller.js normalizes both shapes into
 * whatever this function receives.
 */
export async function uploadAttendancePhoto(photoInput) {
  const uploadSource = Buffer.isBuffer(photoInput)
    ? `data:image/jpeg;base64,${photoInput.toString("base64")}`
    : photoInput;

  const result = await cloudinary.uploader.upload(uploadSource, {
    folder: "smartrays/attendance",
    resource_type: "image",
  });

  return result.secure_url;
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
