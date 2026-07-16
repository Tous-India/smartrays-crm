import mongoose from "mongoose";

// 45 days — see .context/final-plan.md §6.5/§7.4b. Old pings purge automatically
// via the TTL index below; there is no separate cleanup cron.
const LOCATION_PING_TTL_SECONDS = 45 * 24 * 60 * 60;

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
    },
    // Device-reported timestamp, distinct from createdAt (server-received).
    capturedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

locationPingSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOCATION_PING_TTL_SECONDS });

const LocationPing = mongoose.model("LocationPing", locationPingSchema);

export default LocationPing;
export { LOCATION_PING_TTL_SECONDS };
