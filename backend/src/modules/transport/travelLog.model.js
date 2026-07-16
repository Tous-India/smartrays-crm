import mongoose from "mongoose";

// "auto" — generated at Attendance checkout (checkIn.coords → checkOut.coords).
// "manual" — logged directly via POST /travel-logs.
const TRAVEL_LOG_SOURCES = ["auto", "manual"];

// Added 2026-07-13 for Payroll (§7.7/§11.4, resolved) — mileage reimbursement
// must only ever be computed from entries someone with authority actually
// signed off on, auto-generated or not; neither source is auto-approved.
const TRAVEL_LOG_STATUSES = ["pending", "approved", "rejected"];

const travelLogSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    originCoords: {
      lat: Number,
      lng: Number,
    },
    destinationCoords: {
      lat: Number,
      lng: Number,
    },
    distanceKm: {
      type: Number,
      min: 0,
      default: null,
    },
    source: {
      type: String,
      enum: TRAVEL_LOG_SOURCES,
      required: true,
    },
    status: {
      type: String,
      enum: TRAVEL_LOG_STATUSES,
      default: "pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const TravelLog = mongoose.model("TravelLog", travelLogSchema);

export default TravelLog;
export { TRAVEL_LOG_SOURCES, TRAVEL_LOG_STATUSES };
