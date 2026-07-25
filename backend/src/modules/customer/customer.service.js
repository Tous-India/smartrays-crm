import ApiError from "../../utils/ApiError.js";
import { can } from "../../helpers/permission.helper.js";
import { encryptCredential, decryptCredential } from "../../services/credentialEncryption.service.js";
import Customer from "./customer.model.js";
import Contact from "./contact.model.js";
import Contract from "./contract.model.js";
import Credential from "./credential.model.js";
import Invoice from "./invoice.model.js";
import CustomerActivity from "./customerActivity.model.js";
import Project from "../project/project.model.js";
import User from "../user/user.model.js";

/**
 * Builds the Mongo filter fragment that restricts which customers a user can
 * see, the identical pattern to Leads (.context/final-plan.md §5/§11.9):
 * admin sees everything, a manager sees customers owned by their direct
 * reports (and themselves), everyone else sees only their own.
 */
async function resolveOwnershipFilter(requestingUser) {
  if (requestingUser.role === "admin") {
    return {};
  }

  if (requestingUser.role === "manager") {
    const teamMembers = await User.find({ managerId: requestingUser._id }).select("_id");
    const visibleOwnerIds = teamMembers.map((member) => member._id);
    visibleOwnerIds.push(requestingUser._id);
    return { ownerId: { $in: visibleOwnerIds } };
  }

  return { ownerId: requestingUser._id };
}

/**
 * Exposes the same ownership-based visibility this module already computes
 * for GET /customers, as a reusable Customer-id list — used by AMC (§7.10)
 * to scope AMC records via their underlying Customer's ownership, since AMC
 * itself has no separate `ownerId` field of its own. Admin gets `null`
 * (meaning "no filter, sees everything") rather than every id in the
 * database, since the caller only needs to distinguish "unrestricted" from
 * "restricted to this set".
 */
export async function getVisibleCustomerIds(requestingUser) {
  if (requestingUser.role === "admin") {
    return null;
  }

  const ownershipFilter = await resolveOwnershipFilter(requestingUser);
  const customers = await Customer.find(ownershipFilter).select("_id");

  return customers.map((customer) => customer._id);
}

/**
 * Fetches a customer only if it is within the requesting user's scope.
 * Returns a 404 (not 403) for out-of-scope customers, matching the Leads/
 * Location/User precedent for not leaking whether a record exists.
 */
async function getCustomerInScope(customerId, requestingUser) {
  const ownershipFilter = await resolveOwnershipFilter(requestingUser);
  const customer = await Customer.findOne({ _id: customerId, ...ownershipFilter });

  if (!customer) {
    throw new ApiError(404, "Customer not found");
  }

  return customer;
}

/**
 * Sales associates can only ever create customers owned by themselves, no
 * matter what ownerId they send — identical rule to Leads.
 */
function resolveOwnerIdForCreate(requestedOwnerId, requestingUser) {
  if (requestingUser.role === "sales_associate") {
    return requestingUser._id;
  }

  return requestedOwnerId || requestingUser._id;
}

async function recordActivity(customerId, action, description, performedBy) {
  await CustomerActivity.create({ customerId, action, description, performedBy });
}

export async function createCustomer(payload, requestingUser) {
  const ownerId = resolveOwnerIdForCreate(payload.ownerId, requestingUser);

  const customer = await Customer.create({
    companyName: payload.companyName,
    billingType: payload.billingType || null,
    billingName: payload.billingName,
    billingAddress: payload.billingAddress,
    billingState: payload.billingState,
    gstin: payload.gstin,
    phone: payload.phone,
    email: payload.email || null,
    website: payload.website,
    industry: payload.industry,
    ownerId,
    projectManagerId: payload.projectManagerId,
    source: payload.source,
    customerStatus: payload.customerStatus || "active",
    signedUpAt: payload.signedUpAt || new Date(),
    notes: payload.notes,
    clientType: payload.clientType || null,
    siteAddress: payload.siteAddress || null,
    roofType: payload.roofType || null,
    connectionType: payload.connectionType || null,
    estimatedCapacityKw: payload.estimatedCapacityKw ?? null,
    installedCapacityKw: payload.installedCapacityKw ?? null,
    commissioningDate: payload.commissioningDate || null,
    panelBrand: payload.panelBrand || null,
    panelModel: payload.panelModel || null,
    inverterBrand: payload.inverterBrand || null,
    inverterModel: payload.inverterModel || null,
    panelWarrantyExpiry: payload.panelWarrantyExpiry || null,
    inverterWarrantyExpiry: payload.inverterWarrantyExpiry || null,
    workmanshipWarrantyExpiry: payload.workmanshipWarrantyExpiry || null,
    netMeteringStatus: payload.netMeteringStatus || "not_applied",
    subsidyClaimStatus: payload.subsidyClaimStatus || "not_applicable",
  });

  await recordActivity(customer._id, "created", "Customer created", requestingUser._id);

  return customer;
}

export async function listCustomers(filters, requestingUser) {
  const ownershipFilter = await resolveOwnershipFilter(requestingUser);
  const searchFilter = buildSearchFilter(filters.search);
  const statusFilter = filters.status ? { customerStatus: filters.status } : {};
  const ownerFilter = filters.owner ? { ownerId: filters.owner } : {};

  const combinedFilter = {
    $and: [ownershipFilter, searchFilter, statusFilter, ownerFilter],
  };

  return Customer.find(combinedFilter).sort({ createdAt: -1 });
}

function buildSearchFilter(search) {
  if (!search) {
    return {};
  }

  const pattern = new RegExp(escapeRegExp(search), "i");

  return { $or: [{ companyName: pattern }, { email: pattern }, { phone: pattern }] };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getCustomerById(customerId, requestingUser) {
  return getCustomerInScope(customerId, requestingUser);
}

const CUSTOMER_UPDATABLE_FIELDS = [
  "companyName",
  "billingType",
  "billingName",
  "billingAddress",
  "billingState",
  "gstin",
  "phone",
  "email",
  "website",
  "industry",
  "projectManagerId",
  "source",
  "customerStatus",
  "signedUpAt",
  "notes",
  "clientType",
  "siteAddress",
  "roofType",
  "connectionType",
  "estimatedCapacityKw",
  "installedCapacityKw",
  "commissioningDate",
  "panelBrand",
  "panelModel",
  "inverterBrand",
  "inverterModel",
  "panelWarrantyExpiry",
  "inverterWarrantyExpiry",
  "workmanshipWarrantyExpiry",
  "netMeteringStatus",
  "subsidyClaimStatus",
];

/**
 * Reassigning a customer's owner ("Assign owner") is a manager/admin action —
 * a sales associate editing their own customer cannot hand it off to someone
 * else, the identical rule to Leads' updateLead.
 */
export async function updateCustomer(customerId, payload, requestingUser) {
  const customer = await getCustomerInScope(customerId, requestingUser);

  const updatableFields = [...CUSTOMER_UPDATABLE_FIELDS];

  if (requestingUser.role !== "sales_associate") {
    updatableFields.push("ownerId");
  }

  const wasInactive = customer.customerStatus === "inactive";

  updatableFields.forEach((field) => {
    if (payload[field] !== undefined) {
      customer[field] = payload[field];
    }
  });

  await customer.save();

  // Cascade only fires on the active→inactive transition, never repeats on
  // an already-inactive customer being saved again.
  if (!wasInactive && customer.customerStatus === "inactive") {
    await completeActiveProjectsForCustomer(customer._id);
    await recordActivity(customer._id, "deactivated", "Customer deactivated", requestingUser._id);
  } else if (wasInactive && customer.customerStatus === "active") {
    await recordActivity(customer._id, "reactivated", "Customer reactivated", requestingUser._id);
  } else {
    await recordActivity(customer._id, "edited", "Customer updated", requestingUser._id);
  }

  return customer;
}

/**
 * Setting customerStatus to inactive completes every active project for this
 * customer (.context/final-plan.md §7.2/leads-customer-functional-spec.md) —
 * does not touch already-completed or paused projects.
 */
async function completeActiveProjectsForCustomer(customerId) {
  await Project.updateMany({ customerId, status: "active" }, { $set: { status: "completed" } });
}

export async function deleteCustomer(customerId, requestingUser) {
  const customer = await getCustomerInScope(customerId, requestingUser);

  await customer.deleteOne();
}

const BULK_ACTIONS = ["activate", "deactivate", "delete"];

/**
 * Bulk activate/deactivate/delete. The permission required depends on which
 * action was requested (delete needs customers.delete, the other two need
 * customers.edit) — this can't be expressed as a single route-level
 * authorize() call the way single-action endpoints can, so it's checked here
 * instead. Reuses updateCustomer/deleteCustomer per id, so scoping (404 for
 * an out-of-scope id) and the deactivation cascade both apply exactly as they
 * do for the single-record endpoints — no separate copy of that logic.
 */
export async function bulkUpdateCustomers({ ids, action }, requestingUser) {
  if (!BULK_ACTIONS.includes(action)) {
    throw new ApiError(400, `action must be one of: ${BULK_ACTIONS.join(", ")}`);
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, "ids must be a non-empty array");
  }

  const requiredPermission = action === "delete" ? "delete" : "edit";

  if (!can(requestingUser, "customers", requiredPermission)) {
    throw new ApiError(403, "You do not have permission to perform this action");
  }

  const results = [];

  for (const id of ids) {
    try {
      if (action === "activate") {
        await updateCustomer(id, { customerStatus: "active" }, requestingUser);
      } else if (action === "deactivate") {
        await updateCustomer(id, { customerStatus: "inactive" }, requestingUser);
      } else {
        await deleteCustomer(id, requestingUser);
      }

      results.push({ id, success: true });
    } catch (error) {
      results.push({ id, success: false, reason: error.message });
    }
  }

  return results;
}

// --- Contacts ---------------------------------------------------------

export async function listContacts(customerId, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  return Contact.find({ customerId }).sort({ isPrimary: -1, name: 1 });
}

export async function createContact(customerId, payload, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  return Contact.create({
    customerId,
    name: payload.name,
    email: payload.email || null,
    phone: payload.phone,
    designation: payload.designation,
    isPrimary: payload.isPrimary || false,
  });
}

export async function updateContact(customerId, contactId, payload, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  const contact = await Contact.findOne({ _id: contactId, customerId });

  if (!contact) {
    throw new ApiError(404, "Contact not found");
  }

  ["name", "email", "phone", "designation", "isPrimary"].forEach((field) => {
    if (payload[field] !== undefined) {
      contact[field] = payload[field];
    }
  });

  await contact.save();

  return contact;
}

export async function deleteContact(customerId, contactId, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  const contact = await Contact.findOne({ _id: contactId, customerId });

  if (!contact) {
    throw new ApiError(404, "Contact not found");
  }

  await contact.deleteOne();
}

// --- Contracts (+ project/invoice automation) --------------------------

export async function listContracts(customerId, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  return Contract.find({ customerId }).sort({ createdAt: -1 });
}

/**
 * Adding a `monthly` contract auto-creates a recurring Project + draft
 * Invoice; adding a `onetime` contract auto-creates a onetime Project + draft
 * Invoice (.context/final-plan.md §6.3/§6.4, leads-customer-functional-spec.md
 * CUSTOMER MODULE). `yearly` contracts have no automation defined in either
 * source document — deliberately a no-op here, not an oversight.
 */
export async function createContract(customerId, payload, requestingUser) {
  const customer = await getCustomerInScope(customerId, requestingUser);

  const contract = await Contract.create({
    customerId,
    type: payload.type,
    amount: payload.amount ?? null,
    label: payload.label,
    renewalDate: payload.renewalDate || null,
    termYears: payload.termYears ?? null,
  });

  await applyContractCreatedAutomation(customer, contract);
  await recordActivity(customerId, "contract_added", `Contract added: ${contract.type}`, requestingUser._id);

  return contract;
}

async function applyContractCreatedAutomation(customer, contract) {
  if (contract.type === "monthly") {
    await createProjectAndInvoiceForContract(customer, contract, "recurring");
  } else if (contract.type === "onetime") {
    await createProjectAndInvoiceForContract(customer, contract, "onetime");
  }
}

async function createProjectAndInvoiceForContract(customer, contract, projectType) {
  await Project.create({
    name: `${customer.companyName} — ${contract.label || contract.type}`,
    customerId: customer._id,
    projectManagerId: customer.projectManagerId,
    teamMemberIds: [],
    type: projectType,
    status: "active",
    linkedContractId: contract._id,
  });

  // Placeholder Invoice only (§6.3) — full invoicing (numbering, recurring
  // generation, ledger, payment tracking) is Phase 7. This is just enough of
  // a record for the automation chain to write to.
  await Invoice.create({
    customerId: customer._id,
    contractId: contract._id,
    type: "proforma",
    amount: contract.amount,
    balance: contract.amount,
    status: "draft",
  });
}

export async function updateContract(customerId, contractId, payload, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  const contract = await Contract.findOne({ _id: contractId, customerId });

  if (!contract) {
    throw new ApiError(404, "Contract not found");
  }

  ["type", "amount", "label", "renewalDate", "termYears"].forEach((field) => {
    if (payload[field] !== undefined) {
      contract[field] = payload[field];
    }
  });

  await contract.save();

  return contract;
}

/**
 * Deleting a contract completes its linked project and cancels any
 * not-yet-settled linked invoice (§6.3/leads-customer-functional-spec.md:
 * "Deleting a contract completes the linked project and pauses recurring
 * profile" — there's no separate recurring-profile model in this build, so
 * "pauses" maps onto completing the Project and cancelling the draft/sent
 * Invoice instead).
 */
export async function deleteContract(customerId, contractId, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  const contract = await Contract.findOne({ _id: contractId, customerId });

  if (!contract) {
    throw new ApiError(404, "Contract not found");
  }

  await completeLinkedProjectAndCancelInvoice(contract._id);
  await contract.deleteOne();

  await recordActivity(customerId, "contract_removed", `Contract removed: ${contract.type}`, requestingUser._id);
}

async function completeLinkedProjectAndCancelInvoice(contractId) {
  await Project.updateMany(
    { linkedContractId: contractId, status: { $ne: "completed" } },
    { $set: { status: "completed" } }
  );

  await Invoice.updateMany(
    { contractId, status: { $nin: ["paid", "cancelled"] } },
    { $set: { status: "cancelled" } }
  );
}

// --- Credentials --------------------------------------------------------

/**
 * passwordEncrypted/passwordIv are `select: false` on the schema, so this
 * (and every other Credential query below except revealCredential) never
 * returns them — no ciphertext, let alone plaintext, on list/detail.
 */
export async function listCredentials(customerId, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  return Credential.find({ customerId }).sort({ service: 1 });
}

export async function createCredential(customerId, payload, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  const { passwordEncrypted, passwordIv } = encryptCredential(payload.password);

  const credential = await Credential.create({
    customerId,
    service: payload.service,
    username: payload.username,
    passwordEncrypted,
    passwordIv,
    url: payload.url,
    notes: payload.notes,
  });

  // Re-fetch: the in-memory document just returned by .create() still holds
  // the encrypted fields we set above (select:false only applies to fresh
  // queries) — re-querying gets the same sanitized shape every other fetch
  // returns.
  return Credential.findById(credential._id);
}

export async function updateCredential(customerId, credentialId, payload, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  const credential = await Credential.findOne({ _id: credentialId, customerId });

  if (!credential) {
    throw new ApiError(404, "Credential not found");
  }

  ["service", "username", "url", "notes"].forEach((field) => {
    if (payload[field] !== undefined) {
      credential[field] = payload[field];
    }
  });

  if (payload.password !== undefined) {
    const encrypted = encryptCredential(payload.password);
    credential.passwordEncrypted = encrypted.passwordEncrypted;
    credential.passwordIv = encrypted.passwordIv;
  }

  await credential.save();

  return Credential.findById(credential._id);
}

export async function deleteCredential(customerId, credentialId, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  const credential = await Credential.findOne({ _id: credentialId, customerId });

  if (!credential) {
    throw new ApiError(404, "Credential not found");
  }

  await credential.deleteOne();
}

/**
 * The only place plaintext ever leaves the service layer (§7.2). Every
 * reveal is written to the customer's activity log for audit purposes.
 */
export async function revealCredential(customerId, credentialId, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  const credential = await Credential.findOne({ _id: credentialId, customerId }).select(
    "+passwordEncrypted +passwordIv"
  );

  if (!credential) {
    throw new ApiError(404, "Credential not found");
  }

  const password = decryptCredential({
    passwordEncrypted: credential.passwordEncrypted,
    passwordIv: credential.passwordIv,
  });

  await recordActivity(
    customerId,
    "credential_revealed",
    `Credential revealed: ${credential.service}`,
    requestingUser._id
  );

  return { password };
}

// --- Activity log ---------------------------------------------------------

export async function listActivity(customerId, requestingUser) {
  await getCustomerInScope(customerId, requestingUser);

  return CustomerActivity.find({ customerId }).sort({ createdAt: -1 });
}

// --- Customer Portal self-signup support (§7.8) ---------------------------

/**
 * Resolves which `Customer` a self-signup email belongs to, via a
 * domain match against known emails — the verification mechanism for
 * `POST /auth/customer/signup` (user.service.js#createCustomerSelfSignupUser).
 * `Contact.email` is checked first (a company realistically has several real
 * people's addresses on file, so it has the higher hit-rate); `Customer.email`
 * — a single company-level address — is checked only as a fallback when no
 * `Contact` matches. Returns the matching `Customer`'s `_id`, or `null` if
 * neither matches at all. If multiple `Customer`s somehow share a domain
 * (two records for the same real company, or an accidentally shared
 * free-mail domain), the first match found wins — a stated v1 simplification,
 * not exhaustively deduplicated; an admin can always relink a mis-matched
 * signup manually afterward via `PATCH /users/:id`.
 */
export async function resolveCustomerIdByEmailDomain(email) {
  const domain = extractEmailDomain(email);

  if (!domain) {
    return null;
  }

  const domainPattern = new RegExp(`@${escapeRegExp(domain)}$`, "i");

  const matchingContact = await Contact.findOne({ email: domainPattern });

  if (matchingContact) {
    return matchingContact.customerId;
  }

  const matchingCustomer = await Customer.findOne({ email: domainPattern });

  return matchingCustomer ? matchingCustomer._id : null;
}

function extractEmailDomain(email) {
  const atIndex = email.lastIndexOf("@");

  if (atIndex === -1) {
    return null;
  }

  return email.slice(atIndex + 1).toLowerCase();
}
