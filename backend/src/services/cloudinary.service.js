import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

/**
 * Attendance photos are delivered as `type: "authenticated"` (§7.69) — the
 * URL alone is not an access grant. An unsigned authenticated URL returns
 * 401; only a server-signed one resolves.
 *
 * WHY `type` AND NOT `access_mode`. `access_mode: "authenticated"` would have
 * been the smaller change — it leaves the delivery path at `/image/upload/`
 * and has a bulk update API. This account cannot use it: the API rejects it
 * outright with "Cannot update access_mode because this feature is not
 * enabled." Changing the delivery TYPE is the mechanism that is actually
 * available here, and it preserves `public_id` exactly.
 *
 * PHOTOS ARE ALWAYS JPG. The upload pins `format: "jpg"` so the delivery
 * format is deterministic and read-time signing never has to look it up —
 * `private_download_url` requires the format, and a lookup per photo would
 * put a network round-trip in the middle of every list response.
 */
const ATTENDANCE_PHOTO_FOLDER = "smartrays/attendance";
const ATTENDANCE_PHOTO_FORMAT = "jpg";

/**
 * How long a signed attendance-photo URL stays valid. Five minutes: long
 * enough to render a page and open a modal or a map popup off the back of
 * it, short enough that a URL captured from a network log or a screenshot is
 * worthless by the time anyone tries it. The signature is minted per read,
 * so a viewer who still holds permission simply gets a fresh one.
 */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Uploads a check-in/check-out photo to Cloudinary and returns the asset's
 * durable address and its `public_id` — the binary itself is never stored in
 * MongoDB, only these two values (Attendance.checkIn/checkOut's
 * `photoUrl`/`photoPublicId`, §6.5/§7.4/§7.4c). Accepts either a base64 data
 * URI string (JSON body) or a raw Buffer (multipart upload via multer) —
 * attendance.controller.js normalizes both shapes into whatever this
 * function receives.
 *
 * `secureUrl` here is deliberately the UNSIGNED canonical authenticated URL,
 * not the signed one Cloudinary hands back from the upload call. A signed URL
 * expires, so storing one would leave a dead link in the database within
 * minutes (§7.69). What is stored identifies the asset; what is served is
 * minted at read time by `signedAttendancePhotoUrl`.
 */
export async function uploadAttendancePhoto(photoInput) {
  const uploadSource = Buffer.isBuffer(photoInput)
    ? `data:image/jpeg;base64,${photoInput.toString("base64")}`
    : photoInput;

  const result = await cloudinary.uploader.upload(uploadSource, {
    folder: ATTENDANCE_PHOTO_FOLDER,
    resource_type: "image",
    type: "authenticated",
    format: ATTENDANCE_PHOTO_FORMAT,
  });

  return { secureUrl: unsignedAttendancePhotoUrl(result.public_id), publicId: result.public_id };
}

/**
 * The asset's stable, unsigned address — safe to persist, and useless on its
 * own (401 without a signature). Exported for the migration script, which
 * rewrites the URLs of assets that pre-date authenticated delivery.
 */
export function unsignedAttendancePhotoUrl(publicId) {
  return cloudinary.url(publicId, {
    type: "authenticated",
    resource_type: "image",
    secure: true,
    format: ATTENDANCE_PHOTO_FORMAT,
    // No version segment and no SDK analytics parameter. Both would be stored
    // in the database verbatim: a pinned version can go stale against the
    // asset it names, and `?_a=` is telemetry noise that has no business
    // being persisted on an attendance record.
    force_version: false,
    analytics: false,
  });
}

/**
 * Mints a short-lived signed URL for one attendance photo. CALLERS MUST HAVE
 * ALREADY DECIDED THE VIEWER IS ALLOWED TO SEE IT — this function performs no
 * permission check of its own; it is the delivery half of a decision made by
 * `applyVisibilityRules`/`attendance.view_photos` upstream.
 *
 * Returns null when there is no `publicId`, which fails CLOSED: a record
 * whose reference is missing yields no photo rather than falling back to a
 * URL that might still be publicly readable.
 *
 * Signing is local — `private_download_url` computes an HMAC, it does not
 * call Cloudinary — so this is safe to run once per record in a list
 * response, and the API secret never leaves the server.
 */
export function signedAttendancePhotoUrl(publicId, { expiresInSeconds = SIGNED_URL_TTL_SECONDS } = {}) {
  if (!publicId) {
    return null;
  }

  return cloudinary.utils.private_download_url(publicId, ATTENDANCE_PHOTO_FORMAT, {
    resource_type: "image",
    type: "authenticated",
    expires_at: Math.round(Date.now() / 1000) + expiresInSeconds,
  });
}

/**
 * Deletes a single asset from Cloudinary by its `public_id` — used by
 * `attendancePhotoCleanupCron.js` (§7.4c) to actually free the stored photo
 * once a record is old enough, not just clear the DB's reference to it.
 * Callers are expected to handle their own try/catch per-asset (the cron
 * must survive one asset's failure without stopping the whole batch) — this
 * function itself doesn't swallow errors, so a real failure is still visible
 * to whoever calls it.
 *
 * TRIES BOTH DELIVERY TYPES (§7.69). `destroy` defaults to `type: "upload"`
 * and scopes strictly by type: called with the default against an
 * authenticated asset it returns `{ result: "not found" }` — a silent no-op
 * that would have left every migrated photo undeletable while still
 * reporting success. Authenticated is tried first because that is what every
 * asset is after the migration; the `upload` fallback covers anything that
 * pre-dates it.
 */
export async function deleteCloudinaryAsset(publicId) {
  const authenticated = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    type: "authenticated",
  });

  if (authenticated?.result !== "not found") {
    return authenticated;
  }

  return cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "upload" });
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

// --- Private photos: customer complaints and site visits (2026-10-22) -------
// Private like attendance photos (§7.69): uploaded as "authenticated" and only
// ever shown through short-lived signed links — a complaint photo can show the
// inside of a customer's home, and a site photo is proof of presence. The
// folder root is configurable so a local machine's uploads stay apart from
// production's (CLOUDINARY_FOLDER_ROOT, default "smartrays").
const PRIVATE_PHOTO_FORMAT = "jpg";

function privateFolder(name) {
  return `${process.env.CLOUDINARY_FOLDER_ROOT || "smartrays"}/${name}`;
}

async function uploadPrivatePhoto(photoBuffer, mimeType, folderName) {
  const result = await cloudinary.uploader.upload(`data:${mimeType};base64,${photoBuffer.toString("base64")}`, {
    folder: privateFolder(folderName),
    resource_type: "image",
    type: "authenticated",
    format: PRIVATE_PHOTO_FORMAT,
  });

  return { publicId: result.public_id };
}

function signedPrivatePhotoUrl(publicId, expiresInSeconds = SIGNED_URL_TTL_SECONDS) {
  if (!publicId) {
    return null;
  }

  return cloudinary.utils.private_download_url(publicId, PRIVATE_PHOTO_FORMAT, {
    resource_type: "image",
    type: "authenticated",
    expires_at: Math.round(Date.now() / 1000) + expiresInSeconds,
  });
}

export function uploadComplaintPhoto(photoBuffer, mimeType = "image/jpeg") {
  return uploadPrivatePhoto(photoBuffer, mimeType, "complaints");
}

export function signedComplaintPhotoUrl(publicId, { expiresInSeconds } = {}) {
  return signedPrivatePhotoUrl(publicId, expiresInSeconds);
}

export function uploadVisitPhoto(photoBuffer, mimeType = "image/jpeg") {
  return uploadPrivatePhoto(photoBuffer, mimeType, "visits");
}

export function signedVisitPhotoUrl(publicId, { expiresInSeconds } = {}) {
  return signedPrivatePhotoUrl(publicId, expiresInSeconds);
}
