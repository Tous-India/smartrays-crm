/**
 * Shrinks a phone photo before upload: longest side 1600 px, JPEG 0.8. A
 * cheap phone's 4–12 MB camera file becomes a few hundred KB — faster on a
 * weak connection and always under the 5 MB limit. Falls back to the original
 * file wherever the browser cannot draw it (or in tests).
 */
const MAX_SIDE = 1600;

export async function shrinkPhoto(file) {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
