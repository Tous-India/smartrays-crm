import ImageResizer from "@bam.tech/react-native-image-resizer";
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE_PX } from "../../constants/attendance.constants";

/**
 * Reduces a captured photo to upload size: longest edge PHOTO_MAX_EDGE_PX,
 * JPEG at PHOTO_JPEG_QUALITY. A camera frame is several MB and 4000px
 * across; a proof-of-presence photo needs a face and a place, which
 * survives 1280px at a fraction of the bytes. Returns the new file's URI and
 * its size in bytes, so the caller can say what it is about to send.
 */
export async function compressPhoto(sourcePath) {
  const result = await ImageResizer.createResizedImage(
    sourcePath,
    PHOTO_MAX_EDGE_PX,
    PHOTO_MAX_EDGE_PX,
    "JPEG",
    PHOTO_JPEG_QUALITY,
    0,
    undefined,
    false,
    { mode: "contain", onlyScaleDown: true }
  );

  return { uri: result.uri, sizeBytes: result.size, width: result.width, height: result.height };
}

/** "184 KB" for a byte count. */
export function formatBytes(bytes) {
  if (typeof bytes !== "number") {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
