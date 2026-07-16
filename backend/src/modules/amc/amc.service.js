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

  return AMC.create({
    customerId: resolvedCustomerId,
    amount: payload.amount ?? null,
    startDate: payload.startDate,
    renewalDate: payload.renewalDate,
    createdFromFlow: payload.flow,
  });
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

export async function listAMC(requestingUser) {
  const filter = await resolveAMCFilter(requestingUser);

  return AMC.find(filter).sort({ renewalDate: 1 });
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

  return amc;
}
