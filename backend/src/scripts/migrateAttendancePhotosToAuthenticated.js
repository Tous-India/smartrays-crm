import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { connectDatabase } from "../database/connection.js";
import { env } from "../config/env.js";
import { unsignedAttendancePhotoUrl } from "../services/cloudinary.service.js";
import Attendance from "../modules/attendance/attendance.model.js";

/**
 * One-time migration (§7.69): attendance check-in/check-out photos were
 * uploaded with Cloudinary's default PUBLIC delivery, so every photo URL was
 * readable by anyone who ever saw it — no cookie, no auth, no referrer. The
 * in-app permission layer decided who was handed a link; the link itself then
 * worked for everybody.
 *
 * This moves every existing asset to authenticated delivery and repairs the
 * database references that go with it.
 *
 * WHY `type` AND NOT `access_mode`. `access_mode: "authenticated"` would have
 * been the gentler change — same `/image/upload/` delivery path, a bulk
 * prefix API, no stored URL to rewrite. This Cloudinary account cannot use
 * it: the API answers "Cannot update access_mode because this feature is not
 * enabled." Changing the delivery TYPE via an in-place rename is what is
 * actually available, and `public_id` survives it unchanged — verified, and
 * asserted below before anything is written to the database.
 *
 * `invalidate: true` matters more than it looks. Cloudinary's CDN keeps
 * serving a previously-delivered public URL from the edge after the asset
 * moves; without invalidation the old link still returns 200 for as long as
 * the cached copy lives. With it, the old URL becomes a 404 — but propagation
 * is not instant, so a verification run immediately after this finishes can
 * still see a cached 200. That is the cache, not a failed migration.
 *
 * RE-RUNNABLE. Every phase is keyed on the state it is fixing, so a run that
 * dies partway can simply be run again: publicIds are only backfilled where
 * missing, only `type: upload` assets are renamed, and only non-authenticated
 * URLs are rewritten. Nothing here is destructive — a rename is reversible,
 * and no photo is deleted.
 *
 * DRY RUN BY DEFAULT. This touches production assets, so it reports what it
 * would do and changes nothing unless `--apply` is passed.
 *
 *   node src/scripts/migrateAttendancePhotosToAuthenticated.js
 *   node src/scripts/migrateAttendancePhotosToAuthenticated.js --apply
 */

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

const FOLDER_PREFIX = "smartrays/attendance/";
const PHOTO_KINDS = ["checkIn", "checkOut"];
const apply = process.argv.includes("--apply");

/**
 * `smartrays/attendance/abc123` out of
 * `https://res.cloudinary.com/<cloud>/image/upload/v123/smartrays/attendance/abc123.jpg`.
 *
 * Needed because one photo reference pre-dates `photoPublicId` existing as a
 * field at all, and after this migration the publicId is the ONLY thing a
 * readable URL can be minted from — a record without one would silently show
 * no photo to a viewer who is entitled to see it.
 */
function publicIdFromUrl(photoUrl) {
  try {
    const { pathname } = new URL(photoUrl);
    const marker = pathname.match(/\/(?:upload|authenticated)\//);

    if (!marker) {
      return null;
    }

    const afterDeliveryType = pathname.slice(marker.index + marker[0].length);
    const withoutVersion = afterDeliveryType.replace(/^v\d+\//, "");
    const withoutExtension = withoutVersion.replace(/\.[a-z0-9]+$/i, "");

    return withoutExtension.startsWith(FOLDER_PREFIX) ? withoutExtension : null;
  } catch {
    return null;
  }
}

/** Every attendance asset Cloudinary still holds under public delivery. */
async function findPublicAssets() {
  const assets = [];
  let nextCursor;

  do {
    const page = await cloudinary.api.resources({
      type: "upload",
      prefix: FOLDER_PREFIX,
      max_results: 500,
      next_cursor: nextCursor,
    });

    assets.push(...page.resources);
    nextCursor = page.next_cursor;
  } while (nextCursor);

  return assets;
}

/** PHASE 1 — every photo reference must have a publicId to be signable. */
async function backfillPublicIds(records) {
  let backfilled = 0;
  let unresolvable = 0;

  for (const record of records) {
    let dirty = false;

    for (const kind of PHOTO_KINDS) {
      const event = record[kind];

      if (!event?.photoUrl || event.photoPublicId) {
        continue;
      }

      const publicId = publicIdFromUrl(event.photoUrl);

      if (!publicId) {
        console.warn(`  ! ${record._id}.${kind}: cannot derive a publicId from ${event.photoUrl}`);
        unresolvable += 1;
        continue;
      }

      console.log(`  + ${record._id}.${kind}: publicId <- ${publicId}`);
      event.photoPublicId = publicId;
      backfilled += 1;
      dirty = true;
    }

    if (dirty && apply) {
      await record.save();
    }
  }

  return { backfilled, unresolvable };
}

/** PHASE 2 — flip delivery to authenticated, preserving the publicId. */
async function migrateAssets(assets) {
  let migrated = 0;
  let failed = 0;

  for (const asset of assets) {
    if (!apply) {
      console.log(`  ~ would rename ${asset.public_id} (upload -> authenticated)`);
      migrated += 1;
      continue;
    }

    try {
      const renamed = await cloudinary.uploader.rename(asset.public_id, asset.public_id, {
        type: "upload",
        to_type: "authenticated",
        resource_type: "image",
        invalidate: true,
      });

      // The whole design rests on the publicId surviving: it is the durable
      // reference every future read signs from. Refuse to continue quietly if
      // Cloudinary ever changes that.
      if (renamed.public_id !== asset.public_id) {
        throw new Error(`publicId changed: ${asset.public_id} -> ${renamed.public_id}`);
      }

      console.log(`  > ${renamed.public_id} now ${renamed.type}`);
      migrated += 1;
    } catch (error) {
      console.error(`  ! ${asset.public_id}: ${String(error?.message || error?.error?.message).slice(0, 140)}`);
      failed += 1;
    }
  }

  return { migrated, failed };
}

/**
 * PHASE 3 — the stored `/image/upload/` URLs are dead links now. Rewrite them
 * to the asset's unsigned authenticated address: still not renderable on its
 * own (401, which is the point), but the correct, durable location of the
 * asset. A SIGNED url is deliberately never stored — it would expire.
 */
async function rewriteStoredUrls(records) {
  let rewritten = 0;
  let documentsTouched = 0;

  for (const record of records) {
    let dirty = false;

    for (const kind of PHOTO_KINDS) {
      const event = record[kind];

      if (!event?.photoUrl || !event.photoPublicId) {
        continue;
      }

      if (event.photoUrl.includes("/image/authenticated/")) {
        continue;
      }

      const next = unsignedAttendancePhotoUrl(event.photoPublicId);
      console.log(`  * ${record._id}.${kind}: -> ${next}`);
      event.photoUrl = next;
      rewritten += 1;
      dirty = true;
    }

    if (dirty) {
      documentsTouched += 1;

      if (apply) {
        await record.save();
      }
    }
  }

  return { rewritten, documentsTouched };
}

async function migrateAttendancePhotos() {
  await connectDatabase();

  console.log(apply ? "APPLYING changes.\n" : "DRY RUN — nothing will be changed. Pass --apply to commit.\n");

  const records = await Attendance.find({
    $or: [{ "checkIn.photoUrl": { $ne: null } }, { "checkOut.photoUrl": { $ne: null } }],
  }).select("+checkIn.photoPublicId +checkOut.photoPublicId");

  const references = records.reduce(
    (total, record) => total + PHOTO_KINDS.filter((kind) => record[kind]?.photoUrl).length,
    0
  );

  console.log(`Database: ${records.length} attendance document(s), ${references} photo reference(s).`);

  console.log("\nPhase 1 — backfill missing publicIds");
  const { backfilled, unresolvable } = await backfillPublicIds(records);
  console.log(`  backfilled: ${backfilled}, unresolvable: ${unresolvable}`);

  console.log("\nPhase 2 — Cloudinary assets to authenticated delivery");
  const assets = await findPublicAssets();
  console.log(`  ${assets.length} asset(s) still on public delivery`);
  const { migrated, failed } = await migrateAssets(assets);
  console.log(`  migrated: ${migrated}, failed: ${failed}`);

  console.log("\nPhase 3 — rewrite stored URLs");
  const { rewritten, documentsTouched } = await rewriteStoredUrls(records);
  console.log(`  rewrote ${rewritten} URL(s) across ${documentsTouched} document(s)`);

  console.log(
    `\n${apply ? "Done" : "Dry run complete"}: ${migrated} asset(s), ${rewritten} URL(s), ${documentsTouched} document(s).`
  );

  if (failed > 0) {
    console.log("Some assets failed — this script is safe to re-run; it will retry only what is still public.");
  }

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

migrateAttendancePhotos().catch((error) => {
  console.error("Failed to migrate attendance photos:", String(error?.message || error?.error?.message));
  process.exit(1);
});
