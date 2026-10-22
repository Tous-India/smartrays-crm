import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";

// Fixed-window rate limiting kept in MongoDB, not in memory: on Vercel every
// request can land on a different serverless instance, so an in-process
// counter would never add up. One document per (key, window); the TTL index
// removes it once the window has passed.
const rateLimitHitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    windowStart: { type: Date, required: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);
rateLimitHitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
rateLimitHitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitHit = mongoose.models.RateLimitHit || mongoose.model("RateLimitHit", rateLimitHitSchema);

/**
 * The caller's address. Vercel sets `x-real-ip` / `x-forwarded-for` from the
 * connecting client; locally it is the socket address.
 */
export function clientAddress(req) {
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim();

  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();

  return req.socket?.remoteAddress || "unknown";
}

/**
 * `rateLimit({ name, windowSeconds, max, keyFrom })` — refuses with 429 once
 * `max` requests share a key inside one window. `keyFrom(req)` defaults to
 * the client address; return a different string to limit per token, etc.
 */
export function rateLimit({ name, windowSeconds, max, keyFrom = clientAddress, message }) {
  return async function rateLimitMiddleware(req, res, next) {
    try {
      const now = Date.now();
      const windowMs = windowSeconds * 1000;
      const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
      const key = `${name}:${keyFrom(req)}`;

      const hit = await RateLimitHit.findOneAndUpdate(
        { key, windowStart },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart.getTime() + windowMs) } },
        { upsert: true, new: true }
      );

      if (hit.count > max) {
        const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - now) / 1000);
        res.set("Retry-After", String(retryAfterSeconds));
        return next(new ApiError(429, message || "Too many requests. Please try again later."));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export default RateLimitHit;
