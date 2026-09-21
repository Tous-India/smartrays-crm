import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the delivery half of §7.69 — the parts with no HTTP surface
 * of their own, so no integration test would ever reach them.
 *
 * The Cloudinary SDK is mocked at the package boundary: `destroy` is the only
 * thing here that would make a network call, and its per-type behaviour is
 * precisely what is being asserted.
 */
const destroy = vi.fn();
const upload = vi.fn();

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: { destroy, upload, rename: vi.fn() },
    url: vi.fn(() => "https://res.cloudinary.test/image/authenticated/smartrays/attendance/abc.jpg"),
    utils: {
      private_download_url: vi.fn((publicId, format, options) =>
        `https://api.cloudinary.test/download?public_id=${publicId}&format=${format}&expires_at=${options.expires_at}&type=${options.type}`
      ),
    },
  },
}));

const { signedAttendancePhotoUrl, deleteCloudinaryAsset, unsignedAttendancePhotoUrl } = await import(
  "./cloudinary.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signedAttendancePhotoUrl", () => {
  it("fails closed when there is no publicId", () => {
    // A record with no reference must yield NO photo. Falling back to a stored
    // URL here would be the exact bug this whole change exists to remove.
    expect(signedAttendancePhotoUrl(null)).toBeNull();
    expect(signedAttendancePhotoUrl(undefined)).toBeNull();
    expect(signedAttendancePhotoUrl("")).toBeNull();
  });

  it("signs against authenticated delivery with a five-minute expiry", () => {
    const before = Math.round(Date.now() / 1000);
    const url = signedAttendancePhotoUrl("smartrays/attendance/abc");
    const after = Math.round(Date.now() / 1000);

    expect(url).toContain("public_id=smartrays/attendance/abc");
    expect(url).toContain("type=authenticated");

    const expiresAt = Number(new URL(url).searchParams.get("expires_at"));
    expect(expiresAt).toBeGreaterThanOrEqual(before + 300);
    expect(expiresAt).toBeLessThanOrEqual(after + 300);
  });

  it("honours an explicit expiry", () => {
    const url = signedAttendancePhotoUrl("smartrays/attendance/abc", { expiresInSeconds: 30 });
    const expiresAt = Number(new URL(url).searchParams.get("expires_at"));

    expect(expiresAt).toBeLessThan(Math.round(Date.now() / 1000) + 60);
  });

  it("mints a fresh URL each time rather than reusing one", () => {
    const first = signedAttendancePhotoUrl("smartrays/attendance/abc", { expiresInSeconds: 10 });
    const second = signedAttendancePhotoUrl("smartrays/attendance/abc", { expiresInSeconds: 900 });

    expect(first).not.toBe(second);
  });
});

describe("unsignedAttendancePhotoUrl", () => {
  it("is what gets persisted — no signature, so it cannot go stale", () => {
    expect(unsignedAttendancePhotoUrl("smartrays/attendance/abc")).not.toContain("expires_at");
  });
});

describe("deleteCloudinaryAsset", () => {
  it("deletes an authenticated asset without falling back", async () => {
    destroy.mockResolvedValueOnce({ result: "ok" });

    const result = await deleteCloudinaryAsset("smartrays/attendance/abc");

    expect(result).toEqual({ result: "ok" });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledWith("smartrays/attendance/abc", {
      resource_type: "image",
      type: "authenticated",
    });
  });

  /**
   * The silent no-op this guards against: `destroy` defaults to
   * `type: "upload"` and scopes strictly by type, so against a migrated asset
   * it returns `{ result: "not found" }` — success-shaped, and nothing
   * deleted. The retention cron would have reported clean runs forever while
   * every photo stayed in Cloudinary.
   */
  it("falls back to public delivery for an asset that pre-dates the migration", async () => {
    destroy.mockResolvedValueOnce({ result: "not found" }).mockResolvedValueOnce({ result: "ok" });

    const result = await deleteCloudinaryAsset("smartrays/attendance/legacy");

    expect(result).toEqual({ result: "ok" });
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenLastCalledWith("smartrays/attendance/legacy", {
      resource_type: "image",
      type: "upload",
    });
  });
});
