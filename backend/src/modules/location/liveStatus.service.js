import { env } from "../../config/env.js";
import { haversineDistanceMeters } from "../../services/geo.service.js";
import Attendance from "../attendance/attendance.model.js";
import Leave from "../leave/leave.model.js";
import User from "../user/user.model.js";
import Customer from "../customer/customer.model.js";
import Service from "../service/service.model.js";
import Visit from "../visit/visit.model.js";
import LocationPing from "./location.model.js";
import { EmployeeLiveStatus, LocationStatusEvent } from "./liveStatus.model.js";

/**
 * Live employee status (2026-10-23) — what each person is doing right now,
 * worked out on the server so the web and the app always agree.
 *
 * During a shift, in this order:
 * - Location off — the phone said so (a status event) and no fix since.
 * - Disconnected — nothing received for LIVE_DISCONNECTED_AFTER_MINUTES; cause
 *   unknown (phone off, app killed, battery died).
 * - Offline — nothing received for LIVE_OFFLINE_AFTER_MINUTES; the phone keeps
 *   recording and uploads when it can ("last synced 12 min ago").
 * - At site — the latest fix inside the radius of a visit assigned for today.
 * - Moving — the phone's GPS speed (or the distance between the last two
 *   fixes) above LIVE_MOVING_SPEED_KMH.
 * - Stationary — "at the same place for 25 min" (fixes within
 *   LIVE_STATIONARY_RADIUS_METERS), named when it is a customer's site.
 * Battery low (under LIVE_BATTERY_LOW_PERCENT, not charging) is a flag beside
 * any of them. Outside a shift: Checked out (today), On leave, Not checked in.
 *
 * The names and colours below are served by GET /location/config, so the web
 * Live Map and the app's team map show the same words in the same colours.
 */
export const LIVE_STATUSES = [
  { key: "moving", label: "Moving", color: "#1971c2", description: "Travelling now" },
  { key: "stationary", label: "Stationary", color: "#f08c00", description: "At the same place for a while" },
  { key: "at_site", label: "At site", color: "#2f9e44", description: "At an assigned site visit" },
  { key: "offline", label: "Offline", color: "#868e96", description: "No internet — the phone keeps recording and uploads later" },
  { key: "location_off", label: "Location off", color: "#e03131", description: "Location or its permission was turned off on the phone" },
  { key: "disconnected", label: "Disconnected", color: "#343a40", description: "Nothing from the phone for a long time — phone off, app closed or battery dead" },
  { key: "checked_out", label: "Checked out", color: "#495057", description: "Shift ended today" },
  { key: "not_checked_in", label: "Not checked in", color: "#adb5bd", description: "No shift today yet" },
  { key: "on_leave", label: "On leave", color: "#7048e8", description: "Approved leave today" },
];
export const LIVE_FLAGS = [{ key: "battery_low", label: "Battery low", color: "#f59f00", description: "Under 15 % and not charging" }];

// Problems first (the brief's order), then working, then not working.
const RANK = { disconnected: 0, location_off: 1, offline: 3, moving: 4, stationary: 5, at_site: 6, not_checked_in: 7, on_leave: 8, checked_out: 9 };
const COUNTED = ["moving", "stationary", "at_site", "offline", "location_off", "disconnected"];
const MIN = 60000;
const RECENT_PINGS = 40;

const minutes = (ms) => ms / MIN;
const latest = (...dates) => dates.filter(Boolean).map((d) => new Date(d)).sort((a, b) => b - a)[0] ?? null;
const kmh = (metresPerSecond) => Math.round(metresPerSecond * 3.6);

export function liveThresholds() {
  return {
    movingSpeedKmh: env.liveMovingSpeedKmh,
    stationaryRadiusMeters: env.liveStationaryRadiusMeters,
    offlineAfterMinutes: env.liveOfflineAfterMinutes,
    disconnectedAfterMinutes: env.liveDisconnectedAfterMinutes,
    batteryLowPercent: env.liveBatteryLowPercent,
    alertAfterMinutes: env.liveAlertAfterMinutes,
  };
}

function nearestPlace(coords, places, radius) {
  let best = null;
  for (const place of places || []) {
    const distance = haversineDistanceMeters(coords, place);
    if (distance <= radius && (!best || distance < best.distance)) best = { name: place.name, distance };
  }
  return best?.name ?? null;
}

/**
 * The status of one person at `now` — pure, so the rules are testable with a
 * fixed clock. `pings` oldest first: [{ capturedAt, receivedAt?, coords, speed? }].
 */
export function computeLiveStatus({
  now = new Date(),
  shift = null,
  onLeave = false,
  pings = [],
  lastSyncAt = null,
  locationOffSince = null,
  battery = null,
  charging = null,
  visits = [],
  customerSites = [],
}) {
  const t = liveThresholds();
  const batteryLow = typeof battery === "number" && battery < t.batteryLowPercent && charging !== true;
  const newest = pings.at(-1) ?? null;
  const common = {
    battery,
    charging,
    batteryLow,
    lastPingAt: newest?.capturedAt ?? null,
    coords: newest?.coords ?? null,
  };

  if (!shift?.open) {
    if (shift?.checkedOutAt) return { ...common, status: "checked_out", since: shift.checkedOutAt, batteryLow: false };
    return { ...common, status: onLeave ? "on_leave" : "not_checked_in", since: null, batteryLow: false };
  }

  const heardAt = latest(lastSyncAt, newest?.receivedAt, newest?.capturedAt, shift.checkInAt);
  const silentMinutes = minutes(now - heardAt);
  const result = (status, since, extra = {}) => ({ ...common, lastSyncAt: heardAt, status, since, speedKmh: null, place: null, ...extra });

  if (locationOffSince && !(newest && new Date(newest.capturedAt) > new Date(locationOffSince))) {
    return result("location_off", new Date(locationOffSince));
  }
  if (silentMinutes >= t.disconnectedAfterMinutes) return result("disconnected", heardAt);
  if (silentMinutes >= t.offlineAfterMinutes) return result("offline", heardAt);
  if (!newest) return result("stationary", new Date(shift.checkInAt));

  const site = (visits || []).find((visit) => !visit.completed && haversineDistanceMeters(newest.coords, visit.site) <= visit.radiusMeters);
  if (site) return result("at_site", new Date(newest.capturedAt), { place: site.customerName ?? null });

  // Moving: the phone's speed, else the distance between the last two fixes.
  let speedKmh = typeof newest.speed === "number" ? kmh(newest.speed) : null;
  const previous = pings.at(-2);
  if (speedKmh === null && previous) {
    const seconds = (new Date(newest.capturedAt) - new Date(previous.capturedAt)) / 1000;
    if (seconds > 0) speedKmh = kmh(haversineDistanceMeters(previous.coords, newest.coords) / seconds);
  }
  if (speedKmh !== null && speedKmh >= t.movingSpeedKmh) return result("moving", new Date(newest.capturedAt), { speedKmh });

  // Stationary since the oldest of the trailing fixes within the radius.
  let since = new Date(newest.capturedAt);
  for (let i = pings.length - 2; i >= 0; i -= 1) {
    if (haversineDistanceMeters(pings[i].coords, newest.coords) > t.stationaryRadiusMeters) break;
    since = new Date(pings[i].capturedAt);
  }
  return result("stationary", since, { speedKmh, place: nearestPlace(newest.coords, customerSites, env.livePlaceRadiusMeters) });
}

// ---------- recording what the phone sends ----------

/**
 * After pings are stored: the newest accepted fix (by capture time) updates
 * the person's record — when we heard from them, and what the phone said.
 */
export async function recordDeviceReport(employeeId, newestPing, receivedAt = new Date()) {
  const current = await EmployeeLiveStatus.findOne({ employeeId }).lean();
  const update = { lastSyncAt: receivedAt };
  const capturedAt = newestPing ? new Date(newestPing.capturedAt) : null;
  if (capturedAt && (!current?.lastPingAt || capturedAt > current.lastPingAt)) {
    update.lastPingAt = capturedAt;
    const device = newestPing.device || {};
    for (const key of ["battery", "charging", "locationOn", "network"]) {
      if (device[key] !== undefined) update[key] = device[key];
    }
    if (current?.locationOffSince && capturedAt > current.locationOffSince) {
      update.locationOffSince = null;
      update.locationOffReason = null;
    }
  }
  await EmployeeLiveStatus.updateOne({ employeeId }, { $set: update }, { upsert: true });
}

/** POST /location/status-events — "location off / on", sent as soon as there is internet. */
export async function recordStatusEvents(events, requestingUser) {
  const employeeId = requestingUser._id;
  const sorted = [...events].sort((a, b) => new Date(a.at) - new Date(b.at));
  await LocationStatusEvent.insertMany(sorted.map((event) => ({ employeeId, type: event.type, at: new Date(event.at), reason: event.reason ?? null })));

  const current = await EmployeeLiveStatus.findOne({ employeeId }).lean();
  let offSince = current?.locationOffSince ?? null;
  let reason = current?.locationOffReason ?? null;
  for (const event of sorted) {
    const at = new Date(event.at);
    if (event.type === "location_off") {
      // A fix captured after it means location came back.
      if (!current?.lastPingAt || at > current.lastPingAt) {
        offSince = offSince && offSince < at ? offSince : at;
        reason = event.reason ?? "unknown";
      }
    } else if (!offSince || at >= offSince) {
      offSince = null;
      reason = null;
    }
  }
  await EmployeeLiveStatus.updateOne(
    { employeeId },
    { $set: { lastSyncAt: new Date(), locationOffSince: offSince, locationOffReason: reason } },
    { upsert: true }
  );
  return { recorded: events.length, locationOff: Boolean(offSince) };
}

// ---------- reading it back ----------

function indiaDayBounds(date = new Date()) {
  const key = date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const start = new Date(`${key}T00:00:00+05:30`);
  return { key, start, end: new Date(start.getTime() + 24 * 3600000) };
}

/** Everyone this caller may see: null visible ids = every active staff member. */
async function visiblePeople(visibleEmployeeIds) {
  const filter = visibleEmployeeIds === null
    ? { isActive: true, role: { $in: ["employee", "manager", "sales_associate"] } }
    : { isActive: true, _id: { $in: visibleEmployeeIds } };
  return User.find(filter).select("_id name role managerId").sort({ name: 1 }).lean();
}

/** The live status of each person — what both GET /location/live-status and my-status return. */
export async function liveStatusFor(people, now = new Date()) {
  if (people.length === 0) return [];
  const ids = people.map((person) => person._id);
  const { start, end, key } = indiaDayBounds(now);

  const [attendances, leaves, records, customers, services] = await Promise.all([
    Attendance.find({ employeeId: { $in: ids }, "checkIn.time": { $gte: new Date(start.getTime() - 24 * 3600000) } }).sort({ "checkIn.time": -1 }).lean(),
    Leave.find({ employeeId: { $in: ids }, status: "approved", startDate: { $lte: end }, endDate: { $gte: start } }).select("employeeId").lean(),
    EmployeeLiveStatus.find({ employeeId: { $in: ids } }).lean(),
    Customer.find({ "siteLocation.lat": { $type: "number" } }).select("companyName siteLocation").lean(),
    Service.find({ assignedToId: { $in: ids }, dueDate: { $gte: start, $lt: end } }).select("_id assignedToId").lean(),
  ]);
  const visits = services.length
    ? await Visit.find({ serviceId: { $in: services.map((s) => s._id) } }).select("serviceId site radiusMeters completion customerId").lean()
    : [];
  const visitCustomers = new Map(
    (await Customer.find({ _id: { $in: visits.map((v) => v.customerId) } }).select("companyName").lean()).map((c) => [String(c._id), c.companyName])
  );
  const serviceOwner = new Map(services.map((s) => [String(s._id), String(s.assignedToId)]));
  const customerSites = customers.map((c) => ({ name: c.companyName, lat: c.siteLocation.lat, lng: c.siteLocation.lng }));
  const onLeave = new Set(leaves.map((l) => String(l.employeeId)));
  const recordOf = new Map(records.map((r) => [String(r.employeeId), r]));

  return Promise.all(
    people.map(async (person) => {
      const id = String(person._id);
      const mine = attendances.filter((a) => String(a.employeeId) === id);
      const open = mine.find((a) => !a.checkOut?.time);
      const closedToday = mine.find((a) => a.checkOut?.time && a.checkOut.time >= start);
      const record = recordOf.get(id) || {};
      const pings = open
        ? (await LocationPing.find({ attendanceId: open._id }).sort({ capturedAt: -1 }).limit(RECENT_PINGS).select("coords capturedAt createdAt speed").lean())
            .reverse()
            .map((p) => ({ capturedAt: p.capturedAt, receivedAt: p.createdAt, coords: p.coords, speed: p.speed }))
        : [];
      const status = computeLiveStatus({
        now,
        shift: open ? { open: true, checkInAt: open.checkIn.time } : closedToday ? { open: false, checkedOutAt: closedToday.checkOut.time } : null,
        onLeave: onLeave.has(id),
        pings,
        lastSyncAt: latest(record.lastSyncAt, open?.lastHeartbeatAt),
        locationOffSince: record.locationOffSince,
        battery: record.battery ?? null,
        charging: record.charging ?? null,
        visits: visits
          .filter((v) => serviceOwner.get(String(v.serviceId)) === id)
          .map((v) => ({ site: v.site, radiusMeters: v.radiusMeters, completed: Boolean(v.completion?.at), customerName: visitCustomers.get(String(v.customerId)) })),
        customerSites,
      });
      return {
        employeeId: person._id,
        name: person.name,
        role: person.role,
        attendanceId: open?._id ?? null,
        network: record.network ?? null,
        locationOffReason: status.status === "location_off" ? record.locationOffReason ?? null : null,
        date: key,
        ...status,
      };
    })
  );
}

function sortProblemsFirst(rows) {
  const rank = (row) => (row.batteryLow && RANK[row.status] > 1 && RANK[row.status] < 7 ? 2 : RANK[row.status] ?? 99);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** GET /location/live-status — the team list (problems first) and the counts at the top. */
export async function getTeamLiveStatus(visibleEmployeeIds, now = new Date()) {
  const people = await visiblePeople(visibleEmployeeIds);
  const rows = sortProblemsFirst(await liveStatusFor(people, now));
  const counts = Object.fromEntries(COUNTED.map((key) => [key, rows.filter((row) => row.status === key).length]));
  counts.battery_low = rows.filter((row) => row.batteryLow).length;
  return { people: rows, counts, generatedAt: now };
}

// What the employee can do about their own status.
const FIX = { location_off: "turn_on_location", offline: "check_internet", disconnected: "open_app" };

/** GET /location/my-status — the employee's own status, with a "fix it" hint. */
export async function getMyLiveStatus(requestingUser, now = new Date()) {
  const [row] = await liveStatusFor([{ _id: requestingUser._id, name: requestingUser.name, role: requestingUser.role }], now);
  return { ...row, fix: FIX[row.status] ?? (row.batteryLow ? "charge_phone" : null) };
}
