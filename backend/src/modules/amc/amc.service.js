import ApiError from "../../utils/ApiError.js";
import AMC from "./amc.model.js";
import Customer from "../customer/customer.model.js";
import { createCustomer, getVisibleCustomerIds } from "../customer/customer.service.js";

/**
 * smartrays.md: "AMC ... ask which create client or convert client" — §7.10's
 * `flow: "new_customer"|"existing_customer"`. `new_customer` creates a real
 * `Customer` inline (reusing `customer.service.js#createCustomer` directly,
 * the same cross-module direct-call pattern already used elsewhere, e.g.
 * lead→customer conversion — not a duplicated creation path) before creating
 * the AMC record against it; `existing_customer` attaches to a `customerId`
 * that must already exist and be within the requesting user's scope.
 */
export async function createAMC(payload, requestingUser) {
  const resolvedCustomerId =
    payload.flow === "new_customer"
      ? (await createCustomer(payload.newCustomerPayload, requestingUser))._id
      : await resolveExistingCustomerInScope(payload.customerId, requestingUser);

  const created = await AMC.create({
    customerId: resolvedCustomerId,
    amount: payload.amount ?? null,
    startDate: payload.startDate,
    renewalDate: payload.renewalDate,
    createdFromFlow: payload.flow,
  });

  return decorateAMC(created);
}

async function resolveExistingCustomerInScope(customerId, requestingUser) {
  const customer = await Customer.findById(customerId);

  if (!customer) {
    throw new ApiError(400, "customerId does not match an existing customer");
  }

  const visibleCustomerIds = await getVisibleCustomerIds(requestingUser);

  if (visibleCustomerIds && !visibleCustomerIds.some((id) => String(id) === String(customerId))) {
    throw new ApiError(400, "customerId is outside your scope");
  }

  return customerId;
}

/**
 * `view`/`edit` — "own team" (manager) / "own" (sales_associate) per §5's
 * matrix, resolved via the underlying Customer's ownership
 * (`getVisibleCustomerIds`) since AMC has no separate `ownerId` field of its
 * own. `null` from `getVisibleCustomerIds` means admin (unrestricted).
 */
async function resolveAMCFilter(requestingUser) {
  const visibleCustomerIds = await getVisibleCustomerIds(requestingUser);

  return visibleCustomerIds ? { customerId: { $in: visibleCustomerIds } } : {};
}

/**
 * "Expiring soon" threshold (2026-08-05) — an ACTIVE record whose
 * `renewalDate` falls within the next 30 days. Computed server-side and
 * returned as `isExpiringSoon` on every AMC response so the threshold lives
 * in exactly one place; the frontend renders the flag rather than
 * re-deriving "what counts as soon" from raw dates and drifting from this.
 *
 * Already-expired records are excluded deliberately: a record whose renewal
 * date has passed is expired, not "expiring", and the two need visually
 * distinct treatment in the UI. An `expired`-status record is never
 * "expiring soon" either, regardless of its dates.
 */
const EXPIRING_SOON_DAYS = 30;

export function decorateAMC(amc, now = new Date()) {
  const record = typeof amc.toObject === "function" ? amc.toObject() : { ...amc };
  const renewalDate = record.renewalDate ? new Date(record.renewalDate) : null;

  const soonCutoff = new Date(now);
  soonCutoff.setDate(soonCutoff.getDate() + EXPIRING_SOON_DAYS);

  record.isExpiringSoon =
    record.status === "active" && renewalDate != null && renewalDate >= now && renewalDate <= soonCutoff;

  return record;
}

/**
 * `?customerId=` (2026-08-05) narrows to one customer — added for the
 * Customer Detail page's own AMC section, which needs exactly that
 * customer's records. Layered ON TOP of the role scope rather than
 * replacing it: a caller asking for a customer outside their own scope
 * still gets nothing back, because `resolveAMCFilter`'s `customerId: { $in:
 * visible }` and this equality filter are both applied.
 */
export async function listAMC(requestingUser, filters = {}) {
  const scopeFilter = await resolveAMCFilter(requestingUser);
  const query = { ...scopeFilter };

  if (filters.customerId) {
    // Intersect rather than overwrite — `scopeFilter.customerId` is an
    // `$in` over the caller's visible customers when they aren't admin.
    query.$and = [{ customerId: filters.customerId }];
  }

  const records = await AMC.find(query).sort({ renewalDate: 1 });

  return records.map((record) => decorateAMC(record));
}

const AMC_UPDATABLE_FIELDS = ["amount", "startDate", "renewalDate", "status"];

export async function updateAMC(amcId, payload, requestingUser) {
  const filter = await resolveAMCFilter(requestingUser);
  const amc = await AMC.findOne({ _id: amcId, ...filter });

  if (!amc) {
    throw new ApiError(404, "AMC record not found");
  }

  AMC_UPDATABLE_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) {
      amc[field] = payload[field];
    }
  });

  await amc.save();

  return decorateAMC(amc);
}

/**
 * Renew (2026-08-05) — closes the current term and opens the next one as a
 * SEPARATE record. The old record's `status` becomes `expired` and nothing
 * else about it is touched: its `amount`, `startDate` and `renewalDate` are
 * left exactly as they were, because preserving what each historical term
 * actually cost and covered is the entire point of chaining rather than
 * editing dates forward in place.
 *
 * Defaults, all overridable in the body:
 * - `startDate` = the old record's `renewalDate`, so terms abut with no gap
 *   and no overlap.
 * - `renewalDate` = that start date + 1 year.
 * - `amount` = carried over from the old record.
 *
 * Same permission gate and same scope resolution as `updateAMC` (the route
 * uses `authorize("amc", "edit")`, and the lookup below reuses
 * `resolveAMCFilter`), so renewing is exactly as privileged as editing —
 * no new permission key.
 */
export async function renewAMC(amcId, payload = {}, requestingUser) {
  const filter = await resolveAMCFilter(requestingUser);
  const current = await AMC.findOne({ _id: amcId, ...filter });

  if (!current) {
    throw new ApiError(404, "AMC record not found");
  }

  const startDate = payload.startDate ? new Date(payload.startDate) : new Date(current.renewalDate);
  const renewalDate = payload.renewalDate ? new Date(payload.renewalDate) : addOneYear(startDate);

  if (renewalDate <= startDate) {
    throw new ApiError(400, "renewalDate must be after startDate");
  }

  const renewed = await AMC.create({
    customerId: current.customerId,
    amount: payload.amount !== undefined ? payload.amount : current.amount,
    startDate,
    renewalDate,
    status: "active",
    // The renewal inherits how the ORIGINAL relationship began — this field
    // records which flow first created the AMC, and a renewal doesn't
    // change that history.
    createdFromFlow: current.createdFromFlow,
    previousAmcId: current._id,
  });

  // Only after the new term exists, and only `status` — see the docblock
  // above for why the old record's money and dates stay frozen.
  current.status = "expired";
  await current.save();

  return decorateAMC(renewed);
}

/**
 * Calendar-year arithmetic, not `+365 days` — a term starting 2026-02-29
 * should renew on 2027-02-28/03-01 per the calendar, and day-counting drifts
 * across leap years. `setFullYear` handles that the way a human reading
 * "one year later" expects.
 */
function addOneYear(date) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + 1);

  return next;
}
