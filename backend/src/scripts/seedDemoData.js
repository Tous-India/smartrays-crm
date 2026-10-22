import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { isLocalMongoUri } from "../config/databaseGuard.js";
import { connectDatabase } from "../database/connection.js";
import { reconcileRoleTemplatesOnBoot } from "../modules/permission/permission.service.js";
import { createUser } from "../modules/user/user.service.js";
import { createContact, createContract, createCustomer } from "../modules/customer/customer.service.js";
import User from "../modules/user/user.model.js";
import Team from "../modules/team/team.model.js";
import Lead from "../modules/lead/lead.model.js";
import Payment from "../modules/payment/payment.model.js";
import Service from "../modules/service/service.model.js";
import Attendance from "../modules/attendance/attendance.model.js";
import LocationPing from "../modules/location/location.model.js";
import LocationConsent from "../modules/location/locationConsent.model.js";
import Leave from "../modules/leave/leave.model.js";

/**
 * Fills a LOCAL database with realistic, entirely FAKE demo data: an admin, two
 * managers each heading a team of three field employees, leads in every stage,
 * customers with contacts/contracts and an owner + project manager, payments,
 * services with subtasks, leave requests, and 30 days of attendance with
 * location pings around Delhi NCR (three people are on shift right now, so the
 * Live Map has markers).
 *
 *   npm run seed:demo            refuses if the database already has users
 *   npm run seed:demo -- --reset drops the LOCAL database first
 *
 * Every account's password is DEMO_PASSWORD below. Emails use the reserved
 * `.test` domain, so nothing can ever be delivered to a real inbox. No real
 * person, company or phone number is used.
 *
 * Refuses outright unless MONGODB_URI is the local machine — ALLOW_REMOTE_DB
 * does NOT unlock this script.
 */

const DEMO_PASSWORD = "Demo@1234";
const EMAIL_DOMAIN = "demo.smartrays.test";
const DAYS_OF_HISTORY = 30;
const PING_EVERY_MINUTES = 5;

// --- deterministic randomness, so a re-seed gives the same data -------------
let randomState = 20261022;
function random() {
  randomState |= 0;
  randomState = (randomState + 0x6d2b79f5) | 0;
  let t = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min, max) => min + random() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (probability) => random() < probability;

// --- places around Delhi NCR (public landmarks / sector centres) ------------
const PLACES = {
  officeGurugram: { lat: 28.4595, lng: 77.0266, label: "Smartrays office, Sector 14, Gurugram" },
  officeNoida: { lat: 28.6208, lng: 77.3633, label: "Smartrays site office, Sector 63, Noida" },
  dlfPhase3: { lat: 28.4949, lng: 77.0937 },
  sohnaRoad: { lat: 28.4105, lng: 77.0429 },
  manesar: { lat: 28.3594, lng: 76.9366 },
  dwarka: { lat: 28.5823, lng: 77.0500 },
  faridabad: { lat: 28.3962, lng: 77.3164 },
  noida18: { lat: 28.5708, lng: 77.3261 },
  greaterNoida: { lat: 28.4744, lng: 77.5040 },
  indirapuram: { lat: 28.6411, lng: 77.3714 },
  rohini: { lat: 28.7383, lng: 77.0822 },
  okhla: { lat: 28.5355, lng: 77.2732 },
};

function dayStart(date) {
  // Same convention as attendance.service.js#startOfDay (server-local midnight).
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function at(day, hours, minutes) {
  const date = new Date(day);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function jitter(point, metres) {
  const dLat = (between(-1, 1) * metres) / 111320;
  const dLng = (between(-1, 1) * metres) / (111320 * Math.cos((point.lat * Math.PI) / 180));
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}

function interpolate(from, to, fraction) {
  return { lat: from.lat + (to.lat - from.lat) * fraction, lng: from.lng + (to.lng - from.lng) * fraction };
}

// Same formula as attendance.service.js#computeWorkingHours.
function workingHours(checkInTime, checkOutTime, gaps, breakMs) {
  const gapMs = gaps.reduce((total, gap) => total + (gap.end - gap.start), 0);
  const netMs = Math.max(0, checkOutTime - checkInTime - gapMs - breakMs);
  return Math.round((netMs / 3600000) * 100) / 100;
}

async function refuseUnlessLocal() {
  if (env.isProduction || !isLocalMongoUri(env.mongodbUri)) {
    console.error("seed:demo only runs against a LOCAL database (MONGODB_URI on localhost). Nothing was written.");
    process.exit(1);
  }
}

async function makeUser({ name, role, managerId = null, designation, phone, baseSalary }) {
  const local = name.toLowerCase().replace(/[^a-z]+/g, ".");
  const user = await createUser({
    name,
    email: `${local}@${EMAIL_DOMAIN}`,
    phone,
    password: DEMO_PASSWORD,
    role,
    managerId,
  });
  await User.updateOne(
    { _id: user._id },
    { $set: { designation, baseSalary, joiningDate: new Date(2025, intBetween(0, 11), intBetween(1, 28)) } }
  );
  return user;
}

async function seedPeople() {
  const admin = await makeUser({
    name: "Arjun Mehra",
    role: "admin",
    designation: "Owner",
    phone: "+91 98100 00001",
    baseSalary: null,
  });

  const salesHead = await makeUser({
    name: "Neha Arora",
    role: "manager",
    designation: "Sales & Accounts Manager",
    phone: "+91 98100 00011",
    baseSalary: 65000,
  });
  const installHead = await makeUser({
    name: "Sandeep Rana",
    role: "manager",
    designation: "Installation & Service Manager",
    phone: "+91 98100 00012",
    baseSalary: 70000,
  });

  const salesTeam = [];
  for (const [name, designation, phone] of [
    ["Karan Gill", "Sales Executive", "+91 98100 00021"],
    ["Pooja Saini", "Sales Executive", "+91 98100 00022"],
    ["Imran Qureshi", "Site Surveyor", "+91 98100 00023"],
  ]) {
    salesTeam.push(
      await makeUser({ name, role: "employee", managerId: salesHead._id, designation, phone, baseSalary: 28000 })
    );
  }

  const installTeam = [];
  for (const [name, designation, phone] of [
    ["Deepak Yadav", "Project Engineer", "+91 98100 00031"],
    ["Ritu Chauhan", "Service Technician", "+91 98100 00032"],
    ["Manoj Bisht", "Installation Technician", "+91 98100 00033"],
  ]) {
    installTeam.push(
      await makeUser({ name, role: "employee", managerId: installHead._id, designation, phone, baseSalary: 26000 })
    );
  }

  await Team.create({ name: "Sales & Accounts", type: "Sales", headManagerId: salesHead._id });
  await Team.create({ name: "Installation & Service", type: "Operations", headManagerId: installHead._id });

  return { admin, salesHead, installHead, salesTeam, installTeam };
}

const CUSTOMER_SPECS = [
  { company: "Sharma Residence", type: "residential", place: "dlfPhase3", kw: 5, roof: "rcc", phase: "single_phase", contact: "Rajesh Sharma", area: "DLF Phase 3, Gurugram" },
  { company: "Green Valley Public School", type: "commercial", place: "sohnaRoad", kw: 40, roof: "rcc", phase: "three_phase", contact: "Mrs. Kavita Jain", area: "Sohna Road, Gurugram" },
  { company: "Aggarwal Cold Storage", type: "industrial", place: "manesar", kw: 120, roof: "tin_shed", phase: "three_phase", contact: "Suresh Aggarwal", area: "IMT Manesar" },
  { company: "Verma Villa", type: "residential", place: "dwarka", kw: 3, roof: "rcc", phase: "single_phase", contact: "Anita Verma", area: "Sector 12, Dwarka" },
  { company: "Shree Balaji Textiles", type: "industrial", place: "faridabad", kw: 75, roof: "tin_shed", phase: "three_phase", contact: "Mahesh Goyal", area: "Sector 24, Faridabad" },
  { company: "Kapil Clinic & Diagnostics", type: "commercial", place: "noida18", kw: 15, roof: "rcc", phase: "three_phase", contact: "Dr. Kapil Batra", area: "Sector 18, Noida" },
  { company: "Saxena Family Home", type: "residential", place: "greaterNoida", kw: 4, roof: "tile", phase: "single_phase", contact: "Vivek Saxena", area: "Alpha 1, Greater Noida" },
  { company: "Indirapuram Heights RWA", type: "commercial", place: "indirapuram", kw: 25, roof: "rcc", phase: "three_phase", contact: "Col. (Retd.) R. S. Negi", area: "Indirapuram, Ghaziabad" },
];

async function seedCustomers({ admin, salesHead, salesTeam, installHead, installTeam }) {
  const owners = [salesHead, ...salesTeam.slice(0, 2)];
  const managers = [installHead, installTeam[0]];
  const customers = [];

  for (const [index, spec] of CUSTOMER_SPECS.entries()) {
    const commissioned = index < 5;
    const commissioningDate = commissioned ? new Date(2026, intBetween(2, 8), intBetween(1, 28)) : null;
    const customer = await createCustomer(
      {
        companyName: spec.company,
        billingName: spec.company,
        billingType: spec.type === "residential" ? "non_gst" : "registered",
        billingAddress: spec.area,
        billingState: spec.area.includes("Noida") || spec.area.includes("Ghaziabad") ? "Uttar Pradesh" : spec.area.includes("Dwarka") ? "Delhi" : "Haryana",
        phone: `+91 99990 ${String(10000 + index * 137).slice(0, 5)}`,
        email: `accounts@${spec.company.toLowerCase().replace(/[^a-z]+/g, "")}.${EMAIL_DOMAIN}`,
        ownerId: owners[index % owners.length]._id,
        projectManagerId: managers[index % managers.length]._id,
        source: pick(["Website", "Referral", "Walk-in", "Facebook ad"]),
        clientType: spec.type,
        siteAddress: spec.area,
        roofType: spec.roof,
        connectionType: spec.phase,
        estimatedCapacityKw: spec.kw,
        installedCapacityKw: commissioned ? spec.kw : null,
        commissioningDate,
        panelBrand: commissioned ? pick(["Waaree", "Adani Solar", "Vikram Solar"]) : null,
        inverterBrand: commissioned ? pick(["Growatt", "Sungrow", "Havells"]) : null,
        netMeteringStatus: commissioned ? pick(["approved", "installed"]) : pick(["not_applied", "applied"]),
        subsidyClaimStatus: spec.type === "residential" ? (commissioned ? pick(["pending", "approved", "disbursed"]) : "pending") : "not_applicable",
        signedUpAt: new Date(2026, intBetween(0, 8), intBetween(1, 28)),
      },
      admin
    );

    await createContact(customer._id, { name: spec.contact, phone: `+91 98990 ${String(20000 + index * 211).slice(0, 5)}`, designation: spec.type === "residential" ? "Owner" : "Admin head", isPrimary: true }, admin);
    if (spec.type !== "residential") {
      await createContact(customer._id, { name: pick(["Rahul (Accounts)", "Sunita (Facility)", "Amit (Maintenance)"]), phone: `+91 98990 ${String(30000 + index * 173).slice(0, 5)}`, designation: "Accounts", isPrimary: false }, admin);
    }

    const projectValue = Math.round(spec.kw * between(48000, 62000));
    await createContract(customer._id, { type: "onetime", amount: projectValue, label: `${spec.kw} kW rooftop solar`, startDate: customer.signedUpAt }, admin);
    if (commissioned && spec.kw >= 15) {
      await createContract(customer._id, { type: "yearly", amount: Math.round(spec.kw * 900), label: "Annual maintenance (AMC)", startDate: commissioningDate, renewalDate: new Date(commissioningDate.getFullYear() + 1, commissioningDate.getMonth(), commissioningDate.getDate()), termYears: 1 }, admin);
    }

    customers.push({ customer, spec, projectValue });
  }

  return customers;
}

async function seedLeads({ salesHead, salesTeam }) {
  const owners = [salesHead, ...salesTeam];
  const names = [
    "Gurpreet Singh", "Meenakshi Iyer", "Tarun Malhotra", "Shalini Gupta", "Harish Chandra", "Nidhi Kaushik",
    "Ajay Thakur", "Rekha Bhatia", "Sunil Dhawan", "Payal Mittal", "Vinod Khatri", "Sakshi Arora",
    "Pradeep Sehgal", "Jyoti Rawat", "Ashok Dahiya", "Monika Sood", "Yogesh Tyagi", "Bhawna Chopra",
    "Rakesh Nagpal", "Divya Kohli", "Naveen Joshi",
  ];
  const statuses = ["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"];
  const areas = ["Sector 56, Gurugram", "Palam Vihar", "Sector 50, Noida", "Vaishali, Ghaziabad", "Sector 21, Faridabad", "Pitampura, Delhi", "Sector 104, Noida"];
  const now = new Date();

  const leads = names.map((name, index) => {
    const status = statuses[index % statuses.length];
    const bill = intBetween(2500, 18000);
    const kw = Math.max(2, Math.round(bill / 1200));
    const open = !["won", "lost"].includes(status);
    return {
      name,
      phone: `+91 97110 ${String(40000 + index * 97).slice(0, 5)}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${EMAIL_DOMAIN}`,
      source: pick(["Website", "Referral", "Facebook ad", "Walk-in", "Exhibition"]),
      status,
      ownerId: owners[index % owners.length]._id,
      isHot: open && chance(0.3),
      budget: kw * 55000,
      clientType: chance(0.75) ? "residential" : "commercial",
      siteAddress: pick(areas),
      monthlyElectricityBill: bill,
      estimatedCapacityKw: kw,
      roofType: pick(["rcc", "rcc", "tin_shed", "tile"]),
      connectionType: kw > 6 ? "three_phase" : "single_phase",
      subsidyApplicable: kw <= 10,
      siteSurveyStatus: ["qualified", "proposal_sent", "negotiation", "won"].includes(status) ? "completed" : status === "contacted" ? "scheduled" : "not_scheduled",
      followUpDate: open ? addMinutes(dayStart(now), (intBetween(1, 7) * 24 + intBetween(10, 17)) * 60) : null,
      followUpNote: open ? pick(["Call back after site photos", "Send revised quote", "Explain PM Surya Ghar subsidy", "Fix survey date"]) : null,
      lostReason: status === "lost" ? pick(["Went with a cheaper installer", "Roof not suitable", "Postponed to next year"]) : null,
      notes: `Monthly bill about ₹${bill.toLocaleString("en-IN")}.`,
    };
  });

  await Lead.insertMany(leads);
  return leads.length;
}

async function seedPayments({ admin, salesTeam, customers }) {
  const now = new Date();
  const payments = [];

  for (const { customer, projectValue } of customers) {
    const instalments = intBetween(1, 2);
    for (let i = 0; i < instalments; i += 1) {
      payments.push({
        customerId: customer._id,
        date: addMinutes(dayStart(now), -intBetween(1, DAYS_OF_HISTORY) * 24 * 60 + 12 * 60),
        amount: Math.round((projectValue * pick([0.2, 0.3, 0.4])) / 100) * 100,
        notes: pick(["Advance by UPI", "Second milestone, NEFT", "Cheque deposited", "Cash at site"]),
        recordedBy: admin._id,
        collectedBy: pick(salesTeam)._id,
      });
    }
  }

  await Payment.insertMany(payments);
  return payments.length;
}

async function seedServices({ admin, salesHead, installHead, salesTeam, installTeam, customers }) {
  const now = new Date();
  const specs = [
    { title: "Site survey", by: salesHead, to: salesTeam[2], subtasks: ["Measure roof", "Check shadow from water tank", "Photograph meter"] },
    { title: "Panel cleaning visit", by: installHead, to: installTeam[1], subtasks: ["Clean all panels", "Check inverter display", "Note generation reading"] },
    { title: "Inverter fault check", by: installHead, to: installTeam[1], subtasks: ["Read error code", "Restart inverter", "Call vendor if code persists"] },
    { title: "Installation — structure and panels", by: installHead, to: installTeam[2], subtasks: ["Fix mounting structure", "Mount panels", "DC wiring", "Earthing"] },
    { title: "Net-meter file submission", by: installHead, to: installTeam[0], subtasks: ["Collect electricity bill copy", "Upload to DISCOM portal", "Book inspection"] },
    { title: "Quotation follow-up", by: salesHead, to: salesTeam[0], subtasks: ["Share revised quote", "Explain subsidy"] },
    { title: "Collect second instalment", by: salesHead, to: salesTeam[1], subtasks: ["Confirm amount with accounts", "Share UPI details"] },
    { title: "AMC quarterly inspection", by: installHead, to: installTeam[0], subtasks: ["Tighten connections", "Check earthing", "Update AMC log"] },
    { title: "Commissioning", by: admin, to: installTeam[0], subtasks: ["Final testing", "Customer handover", "Explain mobile monitoring app"] },
    { title: "Survey — new commercial enquiry", by: salesHead, to: salesTeam[2], subtasks: ["Meet facility manager", "Roof load note"] },
  ];

  const docs = specs.map((spec, index) => {
    const target = customers[index % customers.length];
    const completed = index % 3 === 0;
    const due = addMinutes(dayStart(now), (intBetween(-5, 6) * 24 + 18) * 60);
    return {
      title: `${spec.title} — ${target.customer.companyName}`,
      description: `${target.spec.area}. Contact: ${target.spec.contact}.`,
      status: completed ? "completed" : "todo",
      assignedToId: spec.to._id,
      createdById: spec.by._id,
      dueDate: due,
      subtasks: spec.subtasks.map((title, subIndex) => ({ title, isDone: completed || subIndex === 0 })),
      completedAt: completed ? addMinutes(due, -120) : undefined,
      completedById: completed ? spec.to._id : undefined,
    };
  });

  await Service.insertMany(docs);
  return docs.length;
}

async function seedLeave({ salesHead, installHead, salesTeam, installTeam }) {
  const today = dayStart(new Date());
  const daysAgo = (n) => addMinutes(today, -n * 24 * 60);
  const daysAhead = (n) => addMinutes(today, n * 24 * 60);

  const leaves = [
    { employeeId: salesTeam[0]._id, startDate: daysAgo(12), endDate: daysAgo(12), type: "paid", status: "approved", reason: "Sister's wedding", approvedBy: salesHead._id },
    { employeeId: installTeam[2]._id, startDate: daysAgo(20), endDate: daysAgo(20), type: "paid", status: "approved", reason: "Fever", approvedBy: installHead._id },
    { employeeId: installTeam[1]._id, startDate: daysAgo(6), endDate: daysAgo(6), type: "unpaid", status: "approved", reason: "Personal work at bank", approvedBy: installHead._id, isHalfDay: true },
    { employeeId: salesTeam[1]._id, startDate: daysAhead(3), endDate: daysAhead(4), type: "paid", status: "pending", reason: "Family function in Jaipur" },
    { employeeId: installTeam[0]._id, startDate: daysAhead(8), endDate: daysAhead(8), type: "paid", status: "pending", reason: "Child's school annual day" },
    { employeeId: salesTeam[2]._id, startDate: daysAgo(9), endDate: daysAgo(9), type: "paid", status: "rejected", reason: "Personal", approvedBy: salesHead._id, declineReason: "Two surveys booked that day — please pick another date" },
  ];

  await Leave.insertMany(leaves);
  return leaves;
}

/**
 * One working day: office → one or two customer sites → office, with a
 * fix every PING_EVERY_MINUTES while moving or waiting at a site.
 */
function planDay({ day, office, sites, openNow }) {
  const checkInTime = openNow ? addMinutes(new Date(), -intBetween(150, 210)) : at(day, 9, intBetween(10, 50));
  const checkOutTime = openNow ? null : at(day, 18, intBetween(5, 70));
  const end = checkOutTime || new Date();

  // Waypoints with the time to reach them.
  const legs = [];
  let cursor = addMinutes(checkInTime, intBetween(20, 45));
  let position = office;
  for (const site of sites) {
    const travel = intBetween(35, 75);
    legs.push({ from: position, to: site, start: cursor, end: addMinutes(cursor, travel) });
    cursor = addMinutes(cursor, travel + intBetween(60, 120));
    position = site;
  }
  legs.push({ from: position, to: office, start: cursor, end: addMinutes(cursor, intBetween(35, 70)) });

  const fixes = [];
  for (let time = checkInTime; time <= end; time = addMinutes(time, PING_EVERY_MINUTES)) {
    let point = office;
    for (const leg of legs) {
      if (time >= leg.start && time <= leg.end) {
        point = interpolate(leg.from, leg.to, (time - leg.start) / (leg.end - leg.start));
        break;
      }
      if (time > leg.end) {
        point = leg.to;
      }
    }
    fixes.push({ capturedAt: time, coords: { ...jitter(point, 25), accuracy: Math.round(between(4, 28)) } });
  }

  return { checkInTime, checkOutTime, fixes };
}

async function seedAttendanceAndPings(people, leaves, customers) {
  const fieldStaff = [
    { user: people.salesHead, office: PLACES.officeGurugram },
    { user: people.installHead, office: PLACES.officeNoida },
    ...people.salesTeam.map((user) => ({ user, office: PLACES.officeGurugram })),
    ...people.installTeam.map((user) => ({ user, office: PLACES.officeNoida })),
  ];
  const onShiftNow = new Set([people.salesTeam[0], people.installTeam[0], people.installTeam[2]].map((u) => String(u._id)));
  const sitePoints = customers.map(({ spec }) => PLACES[spec.place]);
  const today = dayStart(new Date());

  const leaveDays = new Set(
    leaves
      .filter((leave) => leave.status === "approved")
      .map((leave) => `${leave.employeeId}|${dayStart(leave.startDate).getTime()}`)
  );

  let attendanceCount = 0;
  let pingCount = 0;

  for (const { user, office } of fieldStaff) {
    for (let back = DAYS_OF_HISTORY; back >= 0; back -= 1) {
      const day = addMinutes(today, -back * 24 * 60);
      const isToday = back === 0;
      if (day.getDay() === 0) continue; // Sunday off
      if (leaveDays.has(`${user._id}|${day.getTime()}`)) continue;
      if (isToday && !onShiftNow.has(String(user._id))) continue;
      if (!isToday && chance(0.05)) continue; // the odd unexplained absence

      const sites = [pick(sitePoints)];
      if (chance(0.5)) sites.push(pick(sitePoints));
      const { checkInTime, checkOutTime, fixes } = planDay({ day, office, sites, openNow: isToday });

      const gaps = [];
      if (checkOutTime && chance(0.12)) {
        const gapStart = addMinutes(checkInTime, intBetween(120, 300));
        gaps.push({ start: gapStart, end: addMinutes(gapStart, intBetween(15, 40)) });
      }
      const tookBreak = checkOutTime && chance(0.7);
      const breakIn = tookBreak ? at(day, 13, intBetween(20, 45)) : null;
      const breakOut = tookBreak ? addMinutes(breakIn, intBetween(25, 45)) : null;

      const visibleFixes = fixes.filter((fix) => !gaps.some((gap) => fix.capturedAt >= gap.start && fix.capturedAt <= gap.end));
      const first = visibleFixes[0].coords;
      const last = visibleFixes[visibleFixes.length - 1].coords;

      const attendance = await Attendance.create({
        employeeId: user._id,
        date: dayStart(checkInTime),
        checkIn: { time: checkInTime, coords: first },
        checkOut: checkOutTime ? { time: checkOutTime, coords: last } : { time: null },
        breakIn: { time: breakIn },
        breakOut: { time: breakOut },
        status: "present",
        connectivityGaps: gaps,
        workingHours: checkOutTime ? workingHours(checkInTime, checkOutTime, gaps, tookBreak ? breakOut - breakIn : 0) : null,
        lastHeartbeatAt: visibleFixes[visibleFixes.length - 1].capturedAt,
      });
      attendanceCount += 1;

      const pings = visibleFixes.map((fix) => ({
        employeeId: user._id,
        attendanceId: attendance._id,
        coords: fix.coords,
        capturedAt: fix.capturedAt,
        clientPingId: crypto.randomUUID(),
        createdAt: fix.capturedAt,
        updatedAt: fix.capturedAt,
      }));
      await LocationPing.collection.insertMany(pings);
      pingCount += pings.length;
    }

    await LocationConsent.create({
      userId: user._id,
      decision: "granted",
      disclosureVersion: "2026-09-21.1",
      appVersion: "0.0.1",
      deviceId: crypto.randomUUID(),
    });
  }

  return { attendanceCount, pingCount };
}

async function main() {
  await refuseUnlessLocal();
  await connectDatabase();

  const reset = process.argv.includes("--reset");
  if (reset) {
    await mongoose.connection.db.dropDatabase();
    console.log(`Dropped the local database "${mongoose.connection.name}".`);
  } else if ((await User.estimatedDocumentCount()) > 0) {
    console.error("The local database already has users. Re-run with --reset to start from scratch.");
    process.exit(1);
  }

  await reconcileRoleTemplatesOnBoot();
  const people = await seedPeople();
  const customers = await seedCustomers(people);
  const leadCount = await seedLeads(people);
  const paymentCount = await seedPayments({ ...people, customers });
  const serviceCount = await seedServices({ ...people, customers });
  const leaves = await seedLeave(people);
  const { attendanceCount, pingCount } = await seedAttendanceAndPings(people, leaves, customers);

  const accounts = await User.find({}).select("name email role").sort({ role: 1, name: 1 }).lean();
  console.log("\nDemo data ready (all FAKE):");
  console.log(`  ${customers.length} customers, ${leadCount} leads, ${paymentCount} payments, ${serviceCount} services, ${leaves.length} leave requests`);
  console.log(`  ${attendanceCount} attendance days, ${pingCount} location pings`);
  console.log(`\nEvery account's password: ${DEMO_PASSWORD}`);
  accounts.forEach((account) => console.log(`  ${account.role.padEnd(9)} ${account.email}  (${account.name})`));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("seed:demo failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
