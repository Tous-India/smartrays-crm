import mongoose from "mongoose";

// One document per sequence — `{ _id: "ticketNumber", seq }`. `$inc` with
// upsert is atomic, so two complaints raised at the same moment never get the
// same number.
const ticketCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const TicketCounter = mongoose.model("TicketCounter", ticketCounterSchema);

// The first complaint is no. 1001 — a short number that does not look like
// "complaint #1" to a customer.
const FIRST_TICKET_NUMBER = 1001;

export async function nextTicketNumber() {
  const counter = await TicketCounter.findOneAndUpdate(
    { _id: "ticketNumber" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return FIRST_TICKET_NUMBER - 1 + counter.seq;
}

export default TicketCounter;
