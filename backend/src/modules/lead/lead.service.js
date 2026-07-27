import ExcelJS from "exceljs";
import { Readable } from "stream";
import ApiError from "../../utils/ApiError.js";
import Lead, { LEAD_STATUSES } from "./lead.model.js";
import LeadCall from "./leadCall.model.js";
import LeadSource from "./leadSource.model.js";
import User from "../user/user.model.js";
import { createCustomer } from "../customer/customer.service.js";
import { createNotification } from "../notification/notification.service.js";

/**
 * "Push notification when a lead is assigned to you" (leads-customer-
 * functional-spec.md) — fires whenever a lead's `ownerId` is set to someone
 * OTHER than whoever just made the change (assigning a lead to yourself, or
 * creating your own lead, needs no notification telling you what you just
 * did). Used by both `createLead` (initial assignment) and `updateLead`
 * (reassignment) below, so there's exactly one implementation of this rule.
 * Never awaited by its caller for its own sake — `createNotification` itself
 * already never throws on a push failure, so this only ever fails the same
 * way the database write it depends on would.
 */
async function notifyLeadAssignment(lead, requestingUser) {
  if (String(lead.ownerId) === String(requestingUser._id)) {
    return;
  }

  await createNotification(
    lead.ownerId,
    "lead_assigned",
    `You've been assigned a lead: ${lead.name}${lead.companyName ? ` (${lead.companyName})` : ""}`,
    { module: "leads", id: lead._id }
  );
}

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
    clientType: payload.clientType,
    siteAddress: payload.siteAddress || null,
    monthlyElectricityBill: payload.monthlyElectricityBill ?? null,
    estimatedUnitsConsumed: payload.estimatedUnitsConsumed ?? null,
    estimatedCapacityKw: payload.estimatedCapacityKw ?? null,
    roofType: payload.roofType || null,
    connectionType: payload.connectionType || null,
    subsidyApplicable: payload.subsidyApplicable ?? false,
    siteSurveyStatus: payload.siteSurveyStatus || "not_scheduled",
    siteSurveyDate: payload.siteSurveyDate || null,
  });

  await notifyLeadAssignment(lead, requestingUser);

  return lead;
}

export async function listLeads(filters, requestingUser) {
  const ownershipFilter = await resolveOwnershipFilter(requestingUser);
  const searchFilter = buildSearchFilter(filters.search);
  const followUpFilter = buildFollowUpFilter(filters.followUp);
  const statusFilter = filters.status ? { status: filters.status } : {};
  const ownerFilter = filters.owner ? { ownerId: filters.owner } : {};
  const clientTypeFilter = filters.clientType ? { clientType: filters.clientType } : {};

  const combinedFilter = {
    $and: [ownershipFilter, searchFilter, followUpFilter, statusFilter, ownerFilter, clientTypeFilter],
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
    "clientType",
    "siteAddress",
    "monthlyElectricityBill",
    "estimatedUnitsConsumed",
    "estimatedCapacityKw",
    "roofType",
    "connectionType",
    "subsidyApplicable",
    "siteSurveyStatus",
    "siteSurveyDate",
  ];

  // Reassigning a lead's owner ("Assign owner") is a manager/admin action —
  // a sales associate editing their own lead cannot hand it off to someone else.
  if (requestingUser.role !== "sales_associate") {
    updatableFields.push("ownerId");
  }

  const previousOwnerId = String(lead.ownerId);
  const previousFollowUpTime = lead.followUpDate ? lead.followUpDate.getTime() : null;

  updatableFields.forEach((field) => {
    if (payload[field] !== undefined) {
      lead[field] = payload[field];
    }
  });

  // A rescheduled follow-up "re-arms" both reminders — otherwise a lead
  // reminded for its old followUpDate would silently never get reminded
  // again after being pushed to a new date, since the SentAt guards would
  // still be set from the previous one. See lead.model.js for the fields.
  const nextFollowUpTime = lead.followUpDate ? lead.followUpDate.getTime() : null;
  if (payload.followUpDate !== undefined && nextFollowUpTime !== previousFollowUpTime) {
    lead.followUpReminder24hSentAt = null;
    lead.followUpReminder15mSentAt = null;
  }

  await lead.save();

  if (payload.ownerId !== undefined && String(lead.ownerId) !== previousOwnerId) {
    await notifyLeadAssignment(lead, requestingUser);
  }

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
 *
 * `clientType`/`siteAddress`/`roofType`/`connectionType`/`estimatedCapacityKw`
 * are always carried over from the lead itself (same fallback pattern as
 * companyName/email/etc. above) — these are exactly the 5 fields this task
 * specifies get copied at conversion time. Every other solar field on
 * Customer (installedCapacityKw, warranty dates, netMeteringStatus, etc.) has
 * no Lead-side equivalent and is deliberately left unset here, filled in
 * later via a normal Customer edit.
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
      clientType: payload.clientType !== undefined ? payload.clientType : lead.clientType,
      siteAddress: payload.siteAddress !== undefined ? payload.siteAddress : lead.siteAddress,
      roofType: payload.roofType !== undefined ? payload.roofType : lead.roofType,
      connectionType: payload.connectionType !== undefined ? payload.connectionType : lead.connectionType,
      estimatedCapacityKw:
        payload.estimatedCapacityKw !== undefined ? payload.estimatedCapacityKw : lead.estimatedCapacityKw,
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

// Normalizes for comparison — case/whitespace shouldn't decide whether two
// rows count as "the same" lead (an email typed in different case, or a
// phone number with stray whitespace from a spreadsheet export, is still a
// duplicate).
function normalizeForDupeCheck(value) {
  return value ? value.trim().toLowerCase() : "";
}

/**
 * Bulk-creates leads from an uploaded CSV or Excel file. The first row is
 * treated as a header row; column names are matched case-insensitively
 * against the aliases above. Every imported lead is owned by the importing
 * user — mapping an "Owner" column to a different user is not supported yet.
 *
 * Duplicate check: a row matching an existing lead's email OR phone
 * (checked org-wide, not just the importer's own leads — a duplicate could
 * have been created by anyone) is skipped rather than imported.
 * Deliberately NOT companyName — multiple genuine, distinct contacts can
 * legitimately share the same company. Checked against both already-saved
 * leads AND rows already accepted earlier in this same file, so two rows in
 * one upload sharing an email/phone don't both get created — only the
 * first is kept. Only non-empty values are compared.
 *
 * Each skipped row is tagged `type: "invalid"` (missing name / bad status)
 * or `type: "duplicate"` (with `matchedField` and, when it matched an
 * already-saved lead rather than an earlier row in this same file,
 * `existingLeadId`/`existingLeadName` so the admin can look it up) — see
 * backend/README.md's Leads Import section for the full contract.
 */
export async function importLeadsFromFile(fileBuffer, originalFileName, requestingUser) {
  const rows = await parseLeadRows(fileBuffer, originalFileName);

  const existingLeads = await Lead.find({}, "email phone name");
  const leadByEmail = new Map();
  const leadByPhone = new Map();

  existingLeads.forEach((lead) => {
    const email = normalizeForDupeCheck(lead.email);
    const phone = normalizeForDupeCheck(lead.phone);

    if (email) leadByEmail.set(email, lead);
    if (phone) leadByPhone.set(phone, lead);
  });

  const validLeads = [];
  const skipped = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for the header row, +1 to make it 1-indexed

    if (!row.name || !row.name.trim()) {
      skipped.push({ row: rowNumber, type: "invalid", reason: "Missing name" });
      return;
    }

    if (row.status && !LEAD_STATUSES.includes(row.status)) {
      skipped.push({ row: rowNumber, type: "invalid", reason: `Invalid status: ${row.status}` });
      return;
    }

    const email = normalizeForDupeCheck(row.email);
    const phone = normalizeForDupeCheck(row.phone);

    const emailMatch = email && leadByEmail.get(email);
    const phoneMatch = !emailMatch && phone && leadByPhone.get(phone);
    const match = emailMatch || phoneMatch;

    if (match) {
      const matchedField = emailMatch ? "email" : "phone";
      const matchedValue = emailMatch ? row.email : row.phone;
      // Rows already accepted earlier in this same file aren't saved yet (the
      // real insert happens once, after every row is processed), so they
      // have no Mongo _id to reference — point back at that row number
      // instead of an existing-lead id/name in that case.
      const reason = match.row
        ? `Duplicate: ${matchedField} "${matchedValue}" matches row ${match.row} earlier in this file`
        : `Duplicate: ${matchedField} "${matchedValue}" matches existing lead "${match.name}" (${match._id})`;

      skipped.push({
        row: rowNumber,
        type: "duplicate",
        reason,
        matchedField,
        ...(match.row ? {} : { existingLeadId: String(match._id), existingLeadName: match.name }),
      });
      return;
    }

    const newLeadRef = { row: rowNumber, name: row.name };
    if (email) leadByEmail.set(email, newLeadRef);
    if (phone) leadByPhone.set(phone, newLeadRef);

    validLeads.push({
      name: row.name,
      email: row.email || null,
      phone: row.phone,
      companyName: row.companyName,
      source: row.source,
      status: row.status || "new",
      budget: row.budget ? Number(row.budget) : null,
      ownerId: requestingUser._id,
      // The CSV/Excel column set (see COLUMN_ALIASES above) has no client-type
      // column, but `clientType` is a required schema field — "residential"
      // is the most common case for a bulk-imported lead with no other
      // signal, and it's always editable afterward like any other field.
      clientType: "residential",
    });
  });

  const createdLeads = validLeads.length > 0 ? await Lead.insertMany(validLeads) : [];

  const duplicateCount = skipped.filter((entry) => entry.type === "duplicate").length;
  const failedCount = skipped.filter((entry) => entry.type === "invalid").length;

  return {
    importedCount: createdLeads.length,
    duplicateCount,
    failedCount,
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

const REMINDER_EXCLUDED_STATUSES = ["won", "lost"];

/**
 * "Push for upcoming follow-ups: 24h and 15min before, via cron"
 * (leads-customer-functional-spec.md / final-plan.md §7.1). Called by
 * `src/cron/leadFollowUpReminderCron.js` on a 5-minute tick — deliberately a
 * "due within the window and not yet sent" check rather than an exact-match
 * window, so a cron restart or a delayed tick can never cause a reminder to
 * be silently skipped: once `followUpDate` falls inside the next 24h (or
 * 15m), it stays a match on every subsequent tick until the
 * `followUpReminder*SentAt` guard is set, at which point it stops matching
 * for good (see lead.model.js for those fields, and `updateLead` above for
 * how a rescheduled follow-up resets them). A follow-up that's already
 * fully passed (server was down through the whole window) never gets a
 * reminder at all — this is a "before it's due" nudge, not an
 * after-the-fact one; the existing `followUp=overdue` filter already
 * surfaces those. `won`/`lost` leads are excluded — there's nothing left to
 * follow up on.
 */
export async function sendDueFollowUpReminders(referenceDate = new Date()) {
  const [sent24h, sent15m] = await Promise.all([
    sendRemindersForWindow({
      referenceDate,
      windowMs: 24 * 60 * 60 * 1000,
      sentAtField: "followUpReminder24hSentAt",
      windowLabel: "24 hours",
    }),
    sendRemindersForWindow({
      referenceDate,
      windowMs: 15 * 60 * 1000,
      sentAtField: "followUpReminder15mSentAt",
      windowLabel: "15 minutes",
    }),
  ]);

  return { reminders24h: sent24h, reminders15m: sent15m };
}

async function sendRemindersForWindow({ referenceDate, windowMs, sentAtField, windowLabel }) {
  const dueLeads = await Lead.find({
    followUpDate: { $gt: referenceDate, $lte: new Date(referenceDate.getTime() + windowMs) },
    [sentAtField]: null,
    status: { $nin: REMINDER_EXCLUDED_STATUSES },
  });

  for (const lead of dueLeads) {
    await createNotification(
      lead.ownerId,
      "lead_follow_up_due",
      `Follow-up due in ${windowLabel} for ${lead.name}${lead.companyName ? ` (${lead.companyName})` : ""}`,
      { module: "leads", id: lead._id }
    );

    lead[sentAtField] = referenceDate;
    await lead.save();
  }

  return dueLeads.length;
}
