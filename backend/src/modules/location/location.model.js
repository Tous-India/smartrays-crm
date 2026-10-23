import mongoose from "mongoose";

// 45 days — see .context/final-plan.md §6.5/§7.4b. Old pings purge automatically
// via the TTL index below; there is no separate cleanup cron.
const LOCATION_PING_TTL_SECONDS = 45 * 24 * 60 * 60;
// The phone's connection when it sent the fix (live status, 2026-10-23).
const NETWORK_TYPES = ["wifi", "cellular", "none", "unknown"];

const locationPingSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The specific open check-in/check-out record this ping belongs to.
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      required: true,
    },
    coords: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      // Metres, as the device reported it (mobile-backend-plan.md §3.6).
      // Optional: every web ping and every document before 2026-09-21 has
      // none, and the geofence check treats absence as "evaluate as before".
      accuracy: { type: Number, min: 0 },
    },
    // Device-reported timestamp, distinct from createdAt (server-received).
    capturedAt: {
      type: Date,
      required: true,
    },
    // Minted by the app per captured fix (mobile-backend-plan.md §3.3) so a
    // retried batch can never store a fix twice. Required in the batch form,
    // absent on every web ping and every existing document.
    clientPingId: {
      type: String,
    },
    // Live status (2026-10-23) — all optional; every web ping and every
    // older document has none. Metres per second, as the phone's GPS reports it.
    speed: {
      type: Number,
      min: 0,
    },
    // What the phone said about itself at this fix.
    device: {
      type: {
        battery: { type: Number, min: 0, max: 100 },
        charging: { type: Boolean },
        locationOn: { type: Boolean },
        network: { type: String, enum: NETWORK_TYPES },
      },
      default: undefined,
      _id: false,
    },
  },
  {
    timestamps: true,
  }
);

locationPingSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOCATION_PING_TTL_SECONDS });

// Uniqueness of the client id PER EMPLOYEE, and only for documents that carry
// one. A partial index rather than `sparse`: a sparse COMPOUND index still
// indexes a document that has any one of its fields, so every web ping (an
// employeeId, no clientPingId) would collide on `null`. The filter makes the
// index invisible to those documents, exactly as the plan asks.
locationPingSchema.index(
  { employeeId: 1, clientPingId: 1 },
  { unique: true, partialFilterExpression: { clientPingId: { $exists: true } } }
);

const LocationPing = mongoose.model("LocationPing", locationPingSchema);

export default LocationPing;
export { LOCATION_PING_TTL_SECONDS, NETWORK_TYPES };
