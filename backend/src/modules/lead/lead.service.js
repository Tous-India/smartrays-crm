import ExcelJS from "exceljs";
import { Readable } from "stream";
import ApiError from "../../utils/ApiError.js";
import Lead, { LEAD_STATUSES } from "./lead.model.js";
import LeadCall from "./leadCall.model.js";
import LeadSource from "./leadSource.model.js";
import User from "../user/user.model.js";
import { createCustomer } from "../customer/customer.service.js";

const DEFAULT_LEAD_SOURCES = [
  "Website",
  "Meta Ads",
  "Google Ads",
  "Referral",
  "BNI",
  "Cold Call",
  "Walk-in",
  "LinkedIn",
  "Clutch",
  "Other",
];

/**
 * Builds the Mongo filter fragment that restricts which leads a user can see,
 * per .context/final-plan.md §5/§11.9: admin sees everything, a manager sees
 * leads owned by their direct reports (and themselves), everyone else sees
 * only their own.
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
 * Fetches a lead only if it is within the requesting user's scope. Returns a
 * 404 (not a 403) for out-of-scope leads so an out-of-scope user can't tell
 * the difference between "doesn't exist" and "exists but isn't yours".
 */
async function getLeadInScope(leadId, requestingUser) {
  const ownershipFilter = await resolveOwnershipFilter(requestingUser);
  const lead = await Lead.findOne({ _id: leadId, ...ownershipFilter });

  if (!lead) {
    throw new ApiError(404, "Lead not found");
  }

  return lead;
}

/**
 * Sales associates can only ever create leads owned by themselves, no matter
 * what ownerId they send. Admins/managers may assign a lead to anyone.
 */
function resolveOwnerIdForCreate(requestedOwnerId, requestingUser) {
  if (requestingUser.role === "sales_associate") {
    return requestingUser._id;
  }

  return requestedOwnerId || requestingUser._id;
}

export async function createLead(payload, requestingUser) {
  const ownerId = resolveOwnerIdForCreate(payload.ownerId, requestingUser);

  const lead = await Lead.create({
    name: payload.name,
    email: payload.email || null,
    phone: payload.phone,
    companyName: payload.companyName,
    source: payload.source,
    status: payload.status || "new",
    businessStage: payload.businessStage || "new",
    ownerId,
    budget: payload.budget ?? null,
    followUpDate: payload.followUpDate || null,
    followUpNote: payload.followUpNote || null,
    notes: payload.notes,
    lostReason: payload.status === "lost" ? payload.lostReason : null,
  });

  return lead;
}

export async function listLeads(filters, requestingUser) {
  const ownershipFilter = await resolveOwnershipFilter(requestingUser);
  const searchFilter = buildSearchFilter(filters.search);
  const followUpFilter = buildFollowUpFilter(filters.followUp);
  const statusFilter = filters.status ? { status: filters.status } : {};
  const ownerFilter = filters.owner ? { ownerId: filters.owner } : {};

  const combinedFilter = {
    $and: [ownershipFilter, searchFilter, followUpFilter, statusFilter, ownerFilter],
  };

  const leads = await Lead.find(combinedFilter).sort({ createdAt: -1 });

  return leads;
}

function buildSearchFilter(search) {
  if (!search) {
    return {};
  }

  const pattern = new RegExp(escapeRegExp(search), "i");

  return {
    $or: [{ name: pattern }, { companyName: pattern }, { email: pattern }, { phone: pattern }],
  };
}

// Prevents a search string containing regex special characters (e.g. "(", "*")
// from throwing or matching unexpected records.
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "this_week" is a rolling 7-day window starting today, not the calendar
 * Mon–Sun week — simpler to reason about and matches "upcoming" intent.
 */
function buildFollowUpFilter(followUp) {
  if (!followUp) {
    return {};
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const oneWeekFromNow = new Date(startOfToday);
  oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

  if (followUp === "today") {
    return { followUpDate: { $gte: startOfToday, $lt: startOfTomorrow } };
  }

  if (followUp === "overdue") {
    return { followUpDate: { $lt: startOfToday } };
  }

  if (followUp === "this_week") {
    return { followUpDate: { $gte: startOfToday, $lt: oneWeekFromNow } };
  }

  if (followUp === "none") {
    return { followUpDate: null };
  }

  return {};
}

export async function getLeadDetail(leadId, requestingUser) {
  return getLeadInScope(leadId, requestingUser);
}

export async function updateLead(leadId, payload, requestingUser) {
  const lead = await getLeadInScope(leadId, requestingUser);

  const nextStatus = payload.status !== undefined ? payload.status : lead.status;
  const nextLostReason = payload.lostReason !== undefined ? payload.lostReason : lead.lostReason;

  if (nextStatus === "lost" && !nextLostReason) {
    throw new ApiError(400, "Lost reason is required when status is lost");
  }

  const updatableFields = [
    "name",
    "email",
    "phone",
    "companyName",
    "source",
    "status",
    "businessStage",
    "budget",
    "followUpDate",
    "followUpNote",
    "notes",
    "lostReason",
  ];

  // Reassigning a lead's owner ("Assign owner") is a manager/admin action —
  // a sales associate editing their own lead cannot hand it off to someone else.
  if (requestingUser.role !== "sales_associate") {
    updatableFields.push("ownerId");
  }

  updatableFields.forEach((field) => {
    if (payload[field] !== undefined) {
      lead[field] = payload[field];
    }
  });

  await lead.save();

  return lead;
}

export async function deleteLead(leadId, requestingUser) {
  const lead = await getLeadInScope(leadId, requestingUser);

  await lead.deleteOne();
}

export async function changeLeadStatus(leadId, { status, lostReason }, requestingUser) {
  const lead = await getLeadInScope(leadId, requestingUser);

  if (status === "lost" && !lostReason) {
    throw new ApiError(400, "Lost reason is required when marking a lead as lost");
  }

  lead.status = status;

  if (status === "lost") {
    lead.lostReason = lostReason;
  }

  await lead.save();

  return lead;
}

export async function toggleHotFlag(leadId, requestingUser) {
  const lead = await getLeadInScope(leadId, requestingUser);

  lead.isHot = !lead.isHot;

  await lead.save();

  return lead;
}

export async function logLeadCall(leadId, callData, requestingUser) {
  await getLeadInScope(leadId, requestingUser);

  const call = await LeadCall.create({
    leadId,
    calledAt: callData.calledAt,
    durationSeconds: callData.durationSeconds || 0,
    outcome: callData.outcome,
    notes: callData.notes,
  });

  return call;
}

export async function getLeadCallHistory(leadId, requestingUser) {
  await getLeadInScope(leadId, requestingUser);

  const calls = await LeadCall.find({ leadId }).sort({ calledAt: -1 });

  return calls;
}

/**
 * Creates a real Customer from this lead's data (§7.2/leads-customer-
 * functional-spec.md "From Lead Conversion"): companyName/email/phone/source
 * are pre-filled from the lead but overridable via `payload` — the caller
 * is expected to have added the fields a Lead has no equivalent for
 * (projectManagerId, billing details, etc.) before calling this. Sets
 * `convertedCustomerId` on the lead — the closest thing this system has to
 * "archiving" it, since Lead has no separate archived flag and its status
 * enum is unchanged by conversion (the caller marks it "won" beforehand, as
 * its own explicit action, not something this function forces).
 */
export async function convertLeadToCustomer(leadId, payload, requestingUser) {
  const lead = await getLeadInScope(leadId, requestingUser);

  const customer = await createCustomer(
    {
      companyName: payload.companyName || lead.companyName || lead.name,
      email: payload.email !== undefined ? payload.email : lead.email,
      phone: payload.phone !== undefined ? payload.phone : lead.phone,
      source: payload.source !== undefined ? payload.source : lead.source,
      ownerId: payload.ownerId || lead.ownerId,
      projectManagerId: payload.projectManagerId,
      billingType: payload.billingType,
      billingName: payload.billingName,
      billingAddress: payload.billingAddress,
      billingState: payload.billingState,
      gstin: payload.gstin,
      website: payload.website,
      industry: payload.industry,
      notes: payload.notes,
    },
    requestingUser
  );

  lead.convertedCustomerId = customer._id;
  await lead.save();

  return customer;
}

export async function listLeadSources() {
  const existingCount = await LeadSource.countDocuments();

  if (existingCount === 0) {
    const seedDocs = DEFAULT_LEAD_SOURCES.map((name) => ({ name }));
    await LeadSource.insertMany(seedDocs);
  }

  return LeadSource.find().sort({ name: 1 });
}

const COLUMN_ALIASES = {
  name: ["name"],
  email: ["email"],
  phone: ["phone"],
  companyName: ["companyname", "company name", "company"],
  source: ["source"],
  status: ["status"],
  budget: ["budget"],
};

/**
 * Bulk-creates leads from an uploaded CSV or Excel file. The first row is
 * treated as a header row; column names are matched case-insensitively
 * against the aliases above. Every imported lead is owned by the importing
 * user — mapping an "Owner" column to a different user is not supported yet.
 */
export async function importLeadsFromFile(fileBuffer, originalFileName, requestingUser) {
  const rows = await parseLeadRows(fileBuffer, originalFileName);

  const validLeads = [];
  const skipped = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for the header row, +1 to make it 1-indexed

    if (!row.name || !row.name.trim()) {
      skipped.push({ row: rowNumber, reason: "Missing name" });
      return;
    }

    if (row.status && !LEAD_STATUSES.includes(row.status)) {
      skipped.push({ row: rowNumber, reason: `Invalid status: ${row.status}` });
      return;
    }

    validLeads.push({
      name: row.name,
      email: row.email || null,
      phone: row.phone,
      companyName: row.companyName,
      source: row.source,
      status: row.status || "new",
      budget: row.budget ? Number(row.budget) : null,
      ownerId: requestingUser._id,
    });
  });

  const createdLeads = validLeads.length > 0 ? await Lead.insertMany(validLeads) : [];

  return {
    importedCount: createdLeads.length,
    skippedCount: skipped.length,
    skipped,
  };
}

async function parseLeadRows(fileBuffer, originalFileName) {
  const workbook = new ExcelJS.Workbook();
  const isCsv = originalFileName?.toLowerCase().endsWith(".csv");

  if (isCsv) {
    // Wrapping in an array makes Readable.from emit the buffer as one chunk —
    // passing a Buffer directly would iterate it byte-by-byte instead.
    await workbook.csv.read(Readable.from([fileBuffer]));
  } else {
    await workbook.xlsx.load(fileBuffer);
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new ApiError(400, "The uploaded file has no readable sheet");
  }

  const headerRow = worksheet.getRow(1);
  const columnIndexByField = mapColumnsToFields(headerRow);

  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const rowData = {};

    Object.entries(columnIndexByField).forEach(([field, columnIndex]) => {
      const cellValue = row.getCell(columnIndex).value;
      rowData[field] =
        cellValue !== null && cellValue !== undefined ? String(cellValue).trim() : "";
    });

    rows.push(rowData);
  });

  return rows;
}

function mapColumnsToFields(headerRow) {
  const columnIndexByField = {};

  headerRow.eachCell((cell, colNumber) => {
    const headerText = String(cell.value || "")
      .trim()
      .toLowerCase();

    Object.entries(COLUMN_ALIASES).forEach(([field, aliases]) => {
      if (aliases.includes(headerText)) {
        columnIndexByField[field] = colNumber;
      }
    });
  });

  return columnIndexByField;
}

/**
 * Exports the current filtered lead list as an Excel workbook buffer.
 * Cloudinary isn't wired up yet (deferred to Phase 2/3), so this streams the
 * file directly instead of going through the shared reports pipeline planned
 * for Phase 8 (.context/final-plan.md §7.11).
 */
export async function exportLeadsToExcel(filters, requestingUser) {
  const leads = await listLeads(filters, requestingUser);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Leads");

  worksheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Company", key: "companyName", width: 25 },
    { header: "Email", key: "email", width: 25 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Source", key: "source", width: 18 },
    { header: "Status", key: "status", width: 16 },
    { header: "Business Stage", key: "businessStage", width: 16 },
    { header: "Budget", key: "budget", width: 14 },
    { header: "Follow Up Date", key: "followUpDate", width: 20 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];

  leads.forEach((lead) => {
    worksheet.addRow({
      name: lead.name,
      companyName: lead.companyName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      status: lead.status,
      businessStage: lead.businessStage,
      budget: lead.budget,
      followUpDate: lead.followUpDate,
      createdAt: lead.createdAt,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return buffer;
}
