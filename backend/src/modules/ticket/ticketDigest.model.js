import mongoose from "mongoose";

// "The admin's daily complaint summary for this India date has been sent."
// `date` (YYYY-MM-DD, Asia/Kolkata) is unique, so the summary goes out once
// a day however many times the triggers fire — the same once-only pattern as
// ShiftReminder (§7.74).
const ticketDigestSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true },
    sentAt: { type: Date, default: Date.now },
    counts: {
      newYesterday: Number,
      open: Number,
      overdue: Number,
    },
  },
  { versionKey: false }
);

const TicketDigest = mongoose.model("TicketDigest", ticketDigestSchema);

export default TicketDigest;
