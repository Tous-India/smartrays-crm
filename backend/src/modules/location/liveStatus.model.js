import mongoose from "mongoose";
import { LOCATION_PING_TTL_SECONDS, NETWORK_TYPES } from "./location.model.js";

/**
 * Live employee status (2026-10-23) — the small per-person record the status
 * is worked out from, beside the pings: when we last heard from the phone,
 * what it last said about itself, and whether it said location is off. One
 * document per employee, upserted on every ping and status event.
 */
const employeeLiveStatusSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // When the server last received anything from this phone (ping, event).
    lastSyncAt: { type: Date, default: null },
    // The newest fix's capture time.
    lastPingAt: { type: Date, default: null },
    battery: { type: Number, min: 0, max: 100, default: null },
    charging: { type: Boolean, default: null },
    locationOn: { type: Boolean, default: null },
    network: { type: String, enum: [...NETWORK_TYPES, null], default: null },
    // Set by a "location_off" event, cleared by "location_on" or by any newer fix.
    locationOffSince: { type: Date, default: null },
    locationOffReason: { type: String, default: null },
    // The manager alerts already sent — one per (kind, episode start).
    alerts: {
      type: [
        {
          kind: { type: String, enum: ["location_off", "disconnected"], required: true },
          key: { type: String, required: true },
          at: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

/** What the phone reported happened to location — for the day's timeline. */
const locationStatusEventSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["location_off", "location_on"], required: true },
    at: { type: Date, required: true },
    reason: { type: String, default: null },
  },
  { timestamps: true }
);

locationStatusEventSchema.index({ employeeId: 1, at: 1 });
// Same lifetime as the pings they sit beside.
locationStatusEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOCATION_PING_TTL_SECONDS });

export const EmployeeLiveStatus = mongoose.model("EmployeeLiveStatus", employeeLiveStatusSchema);
export const LocationStatusEvent = mongoose.model("LocationStatusEvent", locationStatusEventSchema);
