import mongoose from "mongoose";
import ApiError from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { evaluateFixAgainstFence } from "../../services/geo.service.js";
import { uploadVisitPhoto, signedVisitPhotoUrl } from "../../services/cloudinary.service.js";
import { createService, getService, changeServiceStatus, resolveServiceScopeFilter } from "../service/service.service.js";
import { detectImageType } from "../ticket/publicComplaint.service.js";
import Service from "../service/service.model.js";
import Customer from "../customer/customer.model.js";
import User from "../user/user.model.js";
import Attendance from "../attendance/attendance.model.js";
import LocationPing from "../location/location.model.js";
import Visit from "./visit.model.js";
import { computeVisitStatus, dayBounds, evidenceWindow } from "./visit.status.js";

/**
 * Verified site visits (2026-10-22). Built on Services: assigning a visit
 * creates the Service (assignee check, notification, the Services list — all
 * §7.72's), and every read or action goes through that Service's scope.
 * The visit adds proof: Arrived, site photos and Done are accepted only from
 * a phone inside the site's geofence (the attendance accuracy rule, shared
 * via geo.service.js), only from the assignee, and Arrived only during an
 * open shift — so the route (location pings) exists to judge it by.
 */

const MAX_PHOTOS = 6;
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
// "Live" photo: taken on the phone within this long before it reached us.
const PHOTO_MAX_AGE_MS = 15 * 60000;
const PHOTO_MAX_CLOCK_AHEAD_MS = 2 * 60000;

function maxAccuracy() {
  return Number(env.geofenceMaxAccuracyMeters);
}

function hasLocation(point) {
  return typeof point?.lat === "number" && typeof point?.lng === "number";
}

function plainDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/**
 * The gate for Arrived / photo / Done: a usable fix, inside the fence.
 * Messages are the ones the employee reads on the phone.
 */
function requireAtSite(visit, coords, action) {
  if (!hasLocation(coords)) {
    throw new ApiError(400, "Your location is needed. Please allow location and try again.");
  }

  const fence = evaluateFixAgainstFence(visit.site, coords, visit.radiusMeters, maxAccuracy());

  if (!fence.evaluated) {
    throw new ApiError(
      409,
      `Your location is not precise enough (±${Math.round(coords.accuracy)} m). Step into the open or wait a moment, then try again.`
    );
  }

  if (fence.outside) {
    throw new ApiError(409, `You are ${plainDistance(fence.distanceMeters)} from the site. You can ${action} only at the site.`);
  }

  return fence.distanceMeters;
}

function toCoords(coords) {
  return { lat: coords.lat, lng: coords.lng, ...(typeof coords.accuracy === "number" ? { accuracy: coords.accuracy } : {}) };
}

async function loadVisitWithService(visitId, requestingUser) {
  if (!mongoose.isValidObjectId(visitId)) {
    throw new ApiError(404, "Visit not found");
  }

  const visit = await Visit.findById(visitId);
  if (!visit) {
    throw new ApiError(404, "Visit not found");
  }

  // The Service's scope decides who may see the visit at all — 404 outside it.
  let service;
  try {
    service = await getService(visit.serviceId, requestingUser);
  } catch (error) {
    if (error.statusCode === 404) throw new ApiError(404, "Visit not found");
    throw error;
  }

  return { visit, service };
}

function requireAssignee(service, requestingUser) {
  if (String(service.assignedToId) !== String(requestingUser._id)) {
    throw new ApiError(403, "Only the person this visit is assigned to can do this.");
  }
}

async function pingsFor(visit, service, now) {
  const window = evidenceWindow(visit, service.dueDate, now);
  if (!window) return [];

  return LocationPing.find({
    employeeId: service.assignedToId,
    capturedAt: { $gt: window.from, $lte: window.to },
  })
    .select("coords capturedAt")
    .sort({ capturedAt: 1 })
    .lean();
}

async function present(visit, service, { now = new Date(), withPhotos = true } = {}) {
  const [customer, assignee, pings] = await Promise.all([
    Customer.findById(visit.customerId).select("companyName siteAddress").lean(),
    User.findById(service.assignedToId).select("name").lean(),
    pingsFor(visit, service, now),
  ]);
  const { status, leftAt } = computeVisitStatus({ visit, dueDate: service.dueDate, pings, now, maxAccuracyMeters: maxAccuracy() });

  return {
    _id: visit._id,
    serviceId: visit.serviceId,
    purpose: visit.purpose,
    status,
    leftAt,
    dueDate: service.dueDate,
    customer: { _id: visit.customerId, companyName: customer?.companyName ?? null },
    assignee: { _id: service.assignedToId, name: assignee?.name ?? null },
    site: visit.site,
    siteAddress: visit.siteAddress,
    radiusMeters: visit.radiusMeters,
    arrival: visit.arrival,
    completion: visit.completion,
    minutesOnSite:
      visit.arrival?.at && visit.completion?.at ? Math.round((visit.completion.at - visit.arrival.at) / 60000) : null,
    notes: visit.notes,
    photoCount: visit.photos.length,
    photos: withPhotos
      ? visit.photos.map((photo) => ({
          _id: photo._id,
          url: signedVisitPhotoUrl(photo.publicId),
          coords: photo.coords,
          distanceMeters: Math.round(photo.distanceMeters),
          takenAt: photo.takenAt,
          receivedAt: photo.receivedAt,
        }))
      : undefined,
    createdAt: visit.createdAt,
  };
}

/**
 * Which customers the caller may send someone to: the admin, every active
 * customer; anyone else, active customers that they or the people they can
 * assign to (Services scope — a manager's team) look after, as account owner
 * OR project manager. Customer visibility elsewhere is by owner only, which
 * would hide every site from an installation manager whose team are the
 * project managers.
 */
async function visitCustomerFilter(requestingUser) {
  const active = { customerStatus: { $ne: "inactive" } };
  const scope = await resolveServiceScopeFilter(requestingUser);
  const people = scope.assignedToId?.$in;

  if (!people) {
    return active;
  }

  return { ...active, $or: [{ ownerId: { $in: people } }, { projectManagerId: { $in: people } }] };
}

/** GET /visits/customer-options — the picker in "Assign a visit". */
export async function listVisitCustomerOptions(requestingUser) {
  const customers = await Customer.find(await visitCustomerFilter(requestingUser))
    .select("companyName siteAddress siteLocation")
    .sort({ companyName: 1 })
    .lean();

  return customers.map((customer) => ({
    _id: customer._id,
    companyName: customer.companyName,
    siteAddress: customer.siteAddress || null,
    siteLocation: hasLocation(customer.siteLocation) ? { lat: customer.siteLocation.lat, lng: customer.siteLocation.lng } : null,
  }));
}

/** POST /visits — admin/manager (services.create, checked at the route). */
export async function createVisit(payload, requestingUser) {
  if (!mongoose.isValidObjectId(payload.customerId)) {
    throw new ApiError(400, "Choose a customer for the visit.");
  }
  const customer = await Customer.findOne({ _id: payload.customerId, ...(await visitCustomerFilter(requestingUser)) });
  if (!customer) {
    throw new ApiError(400, "Choose one of the customers you look after.");
  }

  const site = hasLocation(payload.site) ? payload.site : hasLocation(customer.siteLocation) ? customer.siteLocation : null;
  if (!site) {
    throw new ApiError(400, "Pick the site on the map (or find it by its address) before assigning the visit.");
  }
  if (!payload.dueDate || Number.isNaN(new Date(payload.dueDate).getTime())) {
    throw new ApiError(400, "Choose the day of the visit.");
  }

  const purpose = (payload.purpose || "Site visit").trim().slice(0, 80) || "Site visit";
  const siteAddress = (payload.siteAddress || customer.siteAddress || "").trim() || null;

  // The Service first: its own checks (may this caller assign to that person?)
  // run before anything is written, and it sends the assignment notification.
  const service = await createService(
    {
      title: `Site visit — ${customer.companyName} (${purpose})`,
      description: [payload.instructions?.trim(), siteAddress ? `Site: ${siteAddress}` : null].filter(Boolean).join("\n"),
      assignedToId: payload.assignedToId,
      dueDate: payload.dueDate,
    },
    requestingUser
  );

  const visit = await Visit.create({
    serviceId: service._id,
    customerId: customer._id,
    purpose,
    site: { lat: site.lat, lng: site.lng },
    siteAddress,
    radiusMeters: env.visitRadiusMeters,
    createdById: requestingUser._id,
  });

  if (payload.saveToCustomer && hasLocation(payload.site)) {
    await Customer.updateOne({ _id: customer._id }, { $set: { siteLocation: { lat: payload.site.lat, lng: payload.site.lng } } });
  }

  return present(visit, service);
}

/**
 * GET /visits?date=YYYY-MM-DD | ?serviceId= — within the caller's Services
 * scope (admin: all; manager: team + self; others: own).
 */
export async function listVisits({ date, serviceId, assignedTo } = {}, requestingUser) {
  const serviceFilter = await resolveServiceScopeFilter(requestingUser);

  if (serviceId) {
    if (!mongoose.isValidObjectId(serviceId)) return [];
    serviceFilter._id = serviceId;
  }
  if (date) {
    const { start, end } = dayBounds(new Date(`${date}T12:00:00`));
    serviceFilter.dueDate = { $gte: start, $lt: end };
  }
  if (assignedTo && mongoose.isValidObjectId(assignedTo)) {
    serviceFilter.assignedToId = serviceFilter.assignedToId
      ? { $in: serviceFilter.assignedToId.$in.filter((id) => String(id) === String(assignedTo)) }
      : assignedTo;
  }

  const services = await Service.find(serviceFilter).lean();
  const visits = await Visit.find({ serviceId: { $in: services.map((service) => service._id) } });
  const serviceById = new Map(services.map((service) => [String(service._id), service]));
  const now = new Date();

  const rows = await Promise.all(visits.map((visit) => present(visit, serviceById.get(String(visit.serviceId)), { now, withPhotos: false })));
  return rows.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate) || String(a.assignee.name).localeCompare(String(b.assignee.name)));
}

/** GET /visits/:id */
export async function getVisit(visitId, requestingUser) {
  const { visit, service } = await loadVisitWithService(visitId, requestingUser);
  return present(visit, service);
}

/** POST /visits/:id/arrive { coords } — the assignee, at the site, on shift. */
export async function arriveAtVisit(visitId, coords, requestingUser) {
  const { visit, service } = await loadVisitWithService(visitId, requestingUser);
  requireAssignee(service, requestingUser);

  if (visit.arrival?.at) {
    return present(visit, service);
  }

  // Same "open shift" test attendance uses (findOpenAttendance): checked in,
  // not checked out. Arrived without a shift would leave no route to judge.
  const onShift = await Attendance.exists({ employeeId: requestingUser._id, "checkIn.time": { $ne: null }, "checkOut.time": null });
  if (!onShift) {
    throw new ApiError(409, "Please check in first — Arrived works during your shift.");
  }

  const distanceMeters = requireAtSite(visit, coords, "tap Arrived");
  visit.arrival = { at: new Date(), coords: toCoords(coords), distanceMeters };
  await visit.save();

  return present(visit, service);
}

/** POST /visits/:id/photos (multipart: photo, coords JSON, capturedAt) */
export async function addVisitPhoto(visitId, { coords, capturedAt }, file, requestingUser) {
  const { visit, service } = await loadVisitWithService(visitId, requestingUser);
  requireAssignee(service, requestingUser);

  if (!visit.arrival?.at) {
    throw new ApiError(409, "Tap Arrived at the site first, then take the photos.");
  }
  if (visit.completion?.at) {
    throw new ApiError(409, "This visit is already done.");
  }
  if (visit.photos.length >= MAX_PHOTOS) {
    throw new ApiError(400, `A visit can have up to ${MAX_PHOTOS} photos.`);
  }
  if (!file?.buffer) {
    throw new ApiError(400, "Take a photo first.");
  }
  if (file.size > PHOTO_MAX_BYTES) {
    throw new ApiError(400, "That photo is too large.");
  }
  const type = detectImageType(file.buffer);
  if (!type) {
    throw new ApiError(400, "Only photos taken with the camera can be added.");
  }

  const takenAt = new Date(capturedAt);
  const now = Date.now();
  if (Number.isNaN(takenAt.getTime()) || takenAt.getTime() > now + PHOTO_MAX_CLOCK_AHEAD_MS || now - takenAt.getTime() > PHOTO_MAX_AGE_MS) {
    throw new ApiError(409, "This photo was not taken just now. Please take a new photo at the site.");
  }

  const distanceMeters = requireAtSite(visit, coords, "add site photos");
  const { publicId } = await uploadVisitPhoto(file.buffer, type);

  visit.photos.push({ publicId, coords: toCoords(coords), distanceMeters, takenAt, receivedAt: new Date() });
  await visit.save();

  return present(visit, service);
}

/** POST /visits/:id/complete { coords, notes } — at the site, with at least one photo. */
export async function completeVisit(visitId, { coords, notes }, requestingUser) {
  const { visit, service } = await loadVisitWithService(visitId, requestingUser);
  requireAssignee(service, requestingUser);

  if (!visit.arrival?.at) {
    throw new ApiError(409, "Tap Arrived at the site first.");
  }
  if (visit.completion?.at) {
    return present(visit, service);
  }
  if (visit.photos.length === 0) {
    throw new ApiError(409, "Add at least one photo of the site before marking the visit done.");
  }

  const distanceMeters = requireAtSite(visit, coords, "mark the visit done");
  visit.completion = { at: new Date(), coords: toCoords(coords), distanceMeters };
  visit.notes = typeof notes === "string" ? notes.trim().slice(0, 1000) : "";
  await visit.save();

  // The Service is done when the visit is — through its own endpoint logic,
  // so completedAt/completedById are set in the one place they always are.
  const completedService = await changeServiceStatus(service._id, "completed", requestingUser);

  return present(visit, completedService);
}
