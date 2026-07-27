import ApiError from "../../utils/ApiError.js";
import Payment from "./payment.model.js";
import Invoice from "../customer/invoice.model.js";

/**
 * §7.9/§11.3 (resolved): Payments use PARTIAL RECONCILIATION, not a fully
 * standalone log and not full invoicing. If `customerId` + `invoiceId` are
 * both given, the linked Invoice's `balance`/`status` are updated; a
 * manual-only entry (`manualClientName`, no `customerId`) — or a
 * `customerId` with no `invoiceId` — is just logged, nothing to reconcile
 * against, which is expected, not a gap.
 */
export async function createPayment(payload, requestingUser) {
  const { customerId, manualClientName, invoiceId } = payload;

  let invoice = null;

  if (customerId && invoiceId) {
    invoice = await resolveInvoiceForReconciliation(customerId, invoiceId);
  }

  const payment = await Payment.create({
    customerId: customerId || null,
    manualClientName: manualClientName || null,
    date: new Date(payload.date),
    amount: payload.amount,
    notes: payload.notes,
    recordedBy: requestingUser._id,
    invoiceId: invoice ? invoice._id : null,
  });

  if (invoice) {
    await applyPaymentToInvoice(invoice, payload.amount);
  }

  return payment;
}

/**
 * Validates the invoice belongs to the given customer (never allows linking
 * to another customer's invoice) and actually has a balance to reconcile
 * against — a `draft` invoice created without a `Contract.amount` has
 * `balance: null` (§6.3), which can't sensibly be reduced. A `cancelled`
 * invoice is rejected too — reconciling money against a cancelled invoice
 * doesn't make sense.
 */
async function resolveInvoiceForReconciliation(customerId, invoiceId) {
  const invoice = await Invoice.findOne({ _id: invoiceId, customerId });

  if (!invoice) {
    throw new ApiError(400, "invoiceId does not match an existing invoice for this customer");
  }

  if (invoice.balance === null || invoice.balance === undefined) {
    throw new ApiError(400, "This invoice has no balance set and cannot be reconciled against");
  }

  if (invoice.status === "cancelled") {
    throw new ApiError(400, "Cannot apply a payment to a cancelled invoice");
  }

  return invoice;
}

/**
 * Reduces the invoice's balance by the payment amount. Reaching exactly 0 →
 * `status: "paid"`; anything left over (including an overpayment, clamped to
 * 0 rather than going negative — a stated v1 simplification, no
 * refund/credit tracking) → `status: "partially_paid"`, the value added to
 * `INVOICE_STATUSES` for this task (see invoice.model.js).
 */
async function applyPaymentToInvoice(invoice, amount) {
  const newBalance = Math.max(0, invoice.balance - amount);

  invoice.balance = newBalance;
  invoice.status = newBalance === 0 ? "paid" : "partially_paid";

  await invoice.save();
}

// Same `from`/`to` convention already used by Attendance/TravelLog's report
// generators (`generateAttendanceReport`/`generateTravelLogReport`) — parsed
// as plain date strings, range inclusive on both ends via `$lt` + one day
// added to `to` rather than time-of-day math. Not invented fresh for this.
function addOneDay(date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Admin-only (§5's matrix: `payments.view`/`create` are "–" for every other
 * role) — no ownership scoping at all, unlike every other module in this
 * codebase; gated entirely at the route (`authorize("payments", "view")`).
 *
 * `page`/`limit` are the first real server-side pagination in this backend
 * (every other list endpoint returns its full result set and lets the
 * frontend's AntD `Table` paginate client-side) — the Payments page
 * genuinely needs it since payment history only grows. Both optional:
 * omitting `limit` returns every matching row unpaginated (`limit: null` in
 * the response), which is what `PaymentsThisMonthWidget` — the one existing
 * caller, predating this change — relies on.
 */
export async function listPayments({ from, to, page, limit } = {}) {
  const dateFilter = {};

  if (from) {
    dateFilter.$gte = new Date(from);
  }

  if (to) {
    dateFilter.$lt = addOneDay(new Date(to));
  }

  const filter = {};

  if (Object.keys(dateFilter).length > 0) {
    filter.date = dateFilter;
  }

  const total = await Payment.countDocuments(filter);

  let query = Payment.find(filter).sort({ date: -1 });

  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || null;

  if (limitNumber) {
    query = query.skip((pageNumber - 1) * limitNumber).limit(limitNumber);
  }

  const items = await query;

  return { items, total, page: pageNumber, limit: limitNumber };
}
