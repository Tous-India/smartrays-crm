import mongoose from "mongoose";

/**
 * A site visit (2026-10-22): a Service (the work item, its assignee, due date
 * and notifications — §7.72) that also has to be PROVEN on site. The Visit
 * holds only what the Service does not: where the site is, and the evidence —
 * when and where Arrived and Done were tapped, and the site photos with their
 * GPS and time. Assignee, due date, title and completion live on the Service
 * and are read from there, never copied, so they cannot disagree.
 */
const coordsSchema = {
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  accuracy: { type: Number, min: 0 },
};

const evidenceSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    coords: coordsSchema,
    distanceMeters: { type: Number, required: true },
  },
  { _id: false }
);

const visitSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    purpose: { type: String, trim: true, default: "Site visit" },
    site: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    siteAddress: { type: String, trim: true, default: null },
    // Snapshot of VISIT_RADIUS_METERS when assigned, so a later config
    // change never re-judges a finished visit.
    radiusMeters: { type: Number, required: true, min: 10 },
    arrival: { type: evidenceSchema, default: null },
    completion: { type: evidenceSchema, default: null },
    photos: {
      type: [
        {
          publicId: { type: String, required: true },
          coords: coordsSchema,
          distanceMeters: { type: Number, required: true },
          // When the phone says it took the photo, and when the server got it.
          takenAt: { type: Date, required: true },
          receivedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    notes: { type: String, trim: true, default: "" },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

visitSchema.index({ customerId: 1, createdAt: -1 });

const Visit = mongoose.model("Visit", visitSchema);

export default Visit;
