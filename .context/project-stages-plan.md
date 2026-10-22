# Smartrays CRM — Project stages plan (2026-10-22)

**Status: DESIGN ONLY — nothing built (2026-10-22).** No model, route, screen or job described
here exists. Everything marked **Proposal** needs the owner's answer (§9) before it is built.
Business rules, once built, move into `final-plan.md` as a new §7.x; this file is then reduced to a
pointer, the same arrangement as `app-plan.md`.

---

## 1. Summary

Every rooftop-solar job follows the same seven steps, and today the CRM tracks none of them: a
Project only says `active | completed | paused`. This plan gives each **installation project** one
visible stage, a named owner for that stage, the smallest proof that the stage is really done, the
payment that falls due at that point, and a ready-made WhatsApp message for the customer. Field
proof uses the **verified site visit** being built in parallel (geofenced Arrived/Done + live GPS-
and time-stamped photos) — no second proof mechanism. Money stays in the existing **Payments cash
log** (§7.70); stages only say what is *due*, never reconcile it. Customer messages start as a
free **"Share on WhatsApp"** button; automatic sending waits for the owner's budget decision.

**Survey → Design → Material → Install → Net meter → Commissioning → Subsidy**

One rule for every screen: **one big "Mark done" button per stage, which asks only for that
stage's proof (1–3 items), then offers the WhatsApp message.** Nothing else is required to move
forward.

---

## 2. The stages

Roles below are the existing `User.role` values (§5): **admin** (owner), **manager** (sales head
or installation-team head), **sales_associate**, **employee** (surveyor, technician, project
engineer). External parties: **DISCOM**, **customer**. "Verified visit" = the parallel feature: a
Visit assigned to one employee for this customer's site; Arrived/Done only inside the site
geofence; photos taken live in the app, stamped with GPS and time.

Durations are **typical ranges to be corrected by the owner**, not commitments. DISCOM-side steps
vary most and are outside Smartrays' control.

### 2.1 Survey

| | |
|---|---|
| What happens | Someone visits the roof: shade, roof type, space, meter/phase, cable route, inverter spot. |
| Owner | **employee** (surveyor), assigned by **manager** |
| Starts when | Project exists (auto-created from a one-time Contract, §7.2). The Lead may already have `siteSurveyStatus: completed` — then this stage opens pre-filled and is one tap to confirm. |
| Done proof | **Verified visit marked Done** with **3 photos**: roof (wide), electricity meter, proposed inverter spot. Two fields: roof type, phase (already on Customer — `roofType`, `connectionType`). |
| Customer sees | **"Survey booked"** → **"Survey done"** |
| Typical time | 1–3 days after booking |
| Blocks | Customer not home; roof access; no site coordinates on the customer (visit can't be geofenced). |

### 2.2 Design

| | |
|---|---|
| What happens | System size and layout fixed, final price agreed, customer says yes. For subsidy customers, **PM Surya Ghar registration and DISCOM feasibility** happen here (portal requires them before installation — see §2.8). |
| Owner | **manager** (sales head); design file may be prepared by an employee. |
| Starts when | Survey done. |
| Done proof | **1 file** (layout or quote PDF/photo) + **capacity in kW** (writes `Customer.estimatedCapacityKw`) + tick **"Customer approved"**. Subsidy customers also: **portal application number** + tick **"Feasibility approved"**. |
| Customer sees | **"Design ready"** → **"Design approved"** |
| Typical time | 1–3 days; feasibility adds roughly 1–3 weeks (DISCOM-dependent — confirm). |
| Blocks | Customer undecided; feasibility pending or refused (sanctioned load too low, connection not in customer's name). |
| Payment | **Booking advance** falls due (§3). |

### 2.3 Material

| | |
|---|---|
| What happens | Panels, inverter, structure, cables, earthing kit reach the site. |
| Owner | **manager** (installation head) |
| Starts when | Design approved **and** booking advance logged (soft check — owner can override, §9 Q3). |
| Done proof | **1 photo** of material at site (or of the signed delivery challan) + **1 photo of a panel label** and **1 of the inverter label**. No serial-number typing: the label photos are the record. Brand/model fields on Customer (`panelBrand`, `inverterBrand`…) are optional to fill here. |
| Customer sees | **"Material dispatched"** → **"Material delivered"** |
| Typical time | 3–10 days |
| Blocks | Stock; payment not received; for subsidy jobs, panels must be the type the scheme accepts (DCR — confirm, §9 Q11). |
| Payment | **Material payment** falls due **before dispatch** (§3). |

### 2.4 Install

| | |
|---|---|
| What happens | Structure, panels, inverter, wiring, earthing, lightning arrestor. |
| Owner | **employee** (technician / project engineer — the visit assignee); team lead = Project `projectManagerId`. |
| Starts when | Material delivered. |
| Done proof | **Verified visit marked Done** with **4 photos**: panels on roof, inverter mounted, earthing pit, DB/wiring. One field: **installed kW** (writes `Customer.installedCapacityKw`). |
| Customer sees | **"Installation scheduled"** → **"Installation done"** |
| Typical time | 1–3 days on site |
| Blocks | Weather, roof work pending, crew availability. |
| Payment | **Installation payment** falls due (§3). |

### 2.5 Net meter

| | |
|---|---|
| What happens | Net-meter application to the DISCOM, DISCOM approval, bi-directional meter installed. |
| Owner | **manager** or a named employee who handles DISCOM paperwork (§9 Q4); **DISCOM** does the approval and meter. |
| Starts when | Install done (application can be filed earlier if the DISCOM allows — fine, the stage just opens early). |
| Done proof | Three taps that write the **existing** `Customer.netMeteringStatus`: **Applied** (+ DISCOM application number) → **Approved** → **Meter installed** (+ 1 photo of the new meter). |
| Customer sees | **"Net meter applied"** → **"Net meter approved"** → **"Net meter installed"** |
| Typical time | 2–6 weeks — DISCOM-dependent (confirm per DISCOM, §9 Q10). |
| Blocks | DISCOM queue, document mismatch (name/address on bill), meter stock at DISCOM. |

DISCOMs in the area: **BSES Rajdhani / BSES Yamuna / Tata Power-DDL** (Delhi), **DHBVN**
(Gurugram, Faridabad), **PVVNL** (Noida, Ghaziabad). The CRM stores only which one (a 5-value
pick on the project) and the reference number — not each DISCOM's procedure.

### 2.6 Commissioning

| | |
|---|---|
| What happens | DISCOM inspects and issues the commissioning report/certificate; Smartrays hands over the system (demo, monitoring app set up on customer's phone, warranty papers). |
| Owner | **manager**; handover visit by **employee**. DISCOM issues the certificate. |
| Starts when | Net meter installed. |
| Done proof | **Commissioning certificate** (photo or PDF) + **date** (writes `Customer.commissioningDate`). Handover visit optional: if done, it's a verified visit with 1 photo (customer with inverter screen on). Warranty expiry dates on Customer are optional here. |
| Customer sees | **"System live"** |
| Typical time | 1–2 weeks after meter (confirm) |
| Blocks | Inspection slot; inspection objections. |
| Payment | **Final payment** falls due (§3). |

### 2.7 Subsidy (PM Surya Ghar)

| | |
|---|---|
| What happens | Commissioning details and the customer's bank details go on the national portal; subsidy is paid by DBT **to the customer's bank account**. |
| Owner | **manager** / paperwork employee files; **customer** supplies bank details and receives the money. Who files is §9 Q5. |
| Starts when | Commissioning done **and** subsidy applies (`Lead.subsidyApplicable` / residential). Otherwise the stage shows **"Not applicable"** and the project completes at Commissioning. |
| Done proof | Two taps that write the **existing** `Customer.subsidyClaimStatus`: **Claim submitted** (`pending`) → **Subsidy received** (`disbursed`) + date. `rejected` stays available with a one-line reason. **No bank details are stored in the CRM** — only a tick "bank details submitted on portal". |
| Customer sees | **"Subsidy applied"** → **"Subsidy received"** |
| Typical time | Portal states disbursal within ~30 days of a complete claim (reported, confirm). |
| Blocks | Bank-account/name mismatch (common cause of held DBT), missing commissioning upload. |

Smartrays is not paid at this stage — the subsidy is the customer's money. It is tracked because
customers will ask, and because a received subsidy is the happiest moment to ask for a review or
referral.

### 2.8 Public facts used (verify before relying on them)

| Fact | As found | Source / date |
|---|---|---|
| Central subsidy (residential) | ₹30,000/kW up to 2 kW, ₹18,000/kW for the 3rd kW, **capped at ₹78,000** for 3 kW and above | Widely reported since scheme launch (Feb 2024), e.g. Outlook Money; West Bengal govt scheme page. Official portal pmsuryaghar.gov.in did not render for fetch on 2026-10-22. **Confirm current figures.** |
| Sequence | Register (state, DISCOM, consumer no.) → DISCOM feasibility → install by registered vendor → submit plant details + net-meter application → DISCOM inspection & commissioning certificate → submit bank details/cancelled cheque → DBT | Same sources, 2026-10-22 |
| State top-ups | Delhi, Haryana (income-linked) and UP (UPNEDA, ~₹15,000/kW, max ₹30,000) are reported to add their own amounts | Vendor blogs and Mercom, searched 2026-10-22 — **not confirmed; §9 Q12** |

The CRM must not hard-code any of these numbers. If an estimate is ever shown, it comes from a
setting the admin edits.

---

## 3. Payment milestones — **Proposal**

Money keeps going through the existing **Payments cash log** (admin records, `payments.create`,
§7.70). Stages add only a **plan** ("what is due when") and a **due flag**; nothing is reconciled,
nothing auto-blocks.

| # | Milestone | Falls due when | Default share (**Proposal**) |
|---|---|---|---|
| 1 | Booking advance | Design approved | **10%** |
| 2 | Material payment | **Before** material dispatch | **60%** |
| 3 | Installation | Install done | **20%** |
| 4 | Final | Commissioning done (System live) | **10%** |

- These are a common pattern in Indian rooftop solar (small advance, bulk before material, balance
  after install/commissioning), offered as defaults only. Percentages are a per-project plan the
  manager can change in one screen; the base is the linked Contract's `amount`.
- **Subsidy is not a milestone.** The customer pays the full price; the government pays the
  customer. (If the owner instead discounts upfront against the subsidy, that's §9 Q2.)
- **"Received so far"** = sum of this customer's payments logged since the project was created.
  To make that exact when a customer has more than one project, Payment gets one optional
  `projectId` tag (a label, not reconciliation — §7.70 stands).
- **Display:** each milestone shows **Due ₹X · Received ₹Y · Short ₹Z** (or **Paid** in green).

**Reminder rule (Proposal):**

| When | Who gets it | How |
|---|---|---|
| Milestone falls due and received < due | Project manager + admin | In-app notification + push (existing `createNotification` / FCM) |
| Still short after **3 days** | Same, once more | Same |
| Still short after that | Admin only | One line in a **daily** list "Payments due" on the dashboard — no repeated pushes |
| Material milestone short when someone taps "Material dispatched" | The person tapping | A warning **"₹Z still due — dispatch anyway?"** (Yes / No). Owner decides if this should be a hard stop (§9 Q3). |

Customer payment reminders are **not automatic**; the due flag offers a "Share on WhatsApp"
payment-request message (§4) the manager can tap.

---

## 4. Customer WhatsApp updates

### 4.1 Messages

Sent once per customer-facing status change, by whoever marks the stage done (prompted right
after **Mark done**). `{name}`, `{date}`, `{kw}`, `{link}` are filled automatically. Hindi line
optional (per-customer language setting, §9 Q8).

| Stage / event | English | Hindi (optional) |
|---|---|---|
| Survey booked | Hello {name}, your Smartrays site survey is booked for {date}. Our engineer will call before coming. | नमस्ते {name}, आपका Smartrays साइट सर्वे {date} को तय है। हमारे इंजीनियर आने से पहले कॉल करेंगे। |
| Survey done | Survey done at your home. We'll share your solar design in 1–3 days. | आपके घर का सर्वे पूरा हो गया। 1–3 दिन में आपका सोलर डिज़ाइन भेजेंगे। |
| Design ready | Your {kw} kW solar design is ready. Please reply YES to confirm. | आपका {kw} kW सोलर डिज़ाइन तैयार है। पुष्टि के लिए YES लिखें। |
| Material dispatched | Your solar panels and inverter are on the way. | आपके सोलर पैनल और इन्वर्टर रास्ते में हैं। |
| Installation scheduled | Installation is planned for {date}. Please keep the roof accessible. | इंस्टॉलेशन {date} को है। कृपया छत खुली रखें। |
| Installation done | Your {kw} kW solar system is installed. Next: net meter from the electricity company. | आपका {kw} kW सोलर सिस्टम लग गया है। अगला कदम: बिजली कंपनी से नेट मीटर। |
| Net meter applied | We have applied for your net meter. Reference: {ref}. This usually takes a few weeks. | आपके नेट मीटर के लिए आवेदन हो गया है। संदर्भ: {ref}। इसमें आमतौर पर कुछ हफ्ते लगते हैं। |
| Net meter installed | Your net meter is installed. Final inspection by the electricity company is next. | आपका नेट मीटर लग गया है। अब बिजली कंपनी की अंतिम जांच होगी। |
| System live | Your solar system is live! Warranty papers and app login are with you. | आपका सोलर सिस्टम चालू हो गया है! वारंटी कागज़ और ऐप लॉगिन आपके पास हैं। |
| Subsidy applied | Your PM Surya Ghar subsidy claim is submitted. It is paid directly to your bank account. | आपका पीएम सूर्य घर सब्सिडी क्लेम जमा हो गया है। पैसा सीधे आपके बैंक खाते में आएगा। |
| Subsidy received | Subsidy received — congratulations! If you're happy, a review helps us a lot: {reviewLink} | सब्सिडी मिल गई — बधाई हो! अगर आप खुश हैं तो एक रिव्यू ज़रूर दें: {reviewLink} |
| Payment due (manual) | Hello {name}, ₹{amount} is due for the {milestone} stage. Thank you! | नमस्ते {name}, {milestone} चरण के लिए ₹{amount} बाकी है। धन्यवाद! |

Every message may end with **"Track your project: {link}"** if the status page (§5.3) is built.
Text lives in one admin-editable settings list, not in code.

### 4.2 How to send — compare

| | (a) "Share on WhatsApp" button | (b) WhatsApp Business Platform (Cloud API) |
|---|---|---|
| How it works | Button opens WhatsApp on the staff phone/PC with the message pre-filled (`https://wa.me/91XXXXXXXXXX?text=…`). Staff taps Send. | Server sends automatically when a stage changes. |
| Cost | Free | **Costs money** — Meta charges per message/conversation for business-initiated templates (check current India rate card). |
| Setup | None | Meta Business verification, a dedicated number, every message pre-approved as a template, a provider or direct API account. |
| Who it comes from | The staff member's own WhatsApp | The company's business number |
| Reliability | Depends on staff tapping Send | Automatic; delivery status available |
| Effort to build | ~1 day | ~1–2 weeks plus Meta approval time |

**Recommendation: start with (a).** The CRM records "update shared" (who, when) when the button
is tapped — it cannot know the message was actually sent, and says so ("Shared", not
"Delivered"). Move to (b) only with the owner's go and a budget (§9 Q9); the same message list
becomes the template list, so nothing in (a) is wasted.

---

## 5. Screens

### 5.1 Web — owner/manager

**Projects board** (new tab on Projects, default view for installation projects)
- Seven columns, one per stage, plus **Done**. Card = customer name, area (Sector/city), kW,
  **days in this stage**.
- Card turns **amber** when it has sat longer than the stage's normal time, **red** when a payment
  is short. Nothing else is colour-coded.
- Filters: just **My projects / All**, **DISCOM**, **Stuck only**. No drag-and-drop — stages move
  only through Mark done, so proof is never skipped by accident.
- Top strip: counts per stage and "₹ due now" total (admin only).

**Project page — stage tracker**
- A vertical list of the 7 stages: ✓ done (date, who), ● current, ○ upcoming.
- Current stage shows its owner, a big **Mark done** button and, if any, the payment due.
- Mark done opens a small sheet with only that stage's proof items (§2), then **Share on
  WhatsApp**. Done stages expand to show their photos/files.
- **Undo** on the latest stage only (admin/manager), with a one-line reason.

### 5.2 Android app — field staff and managers

**My jobs** (inside the existing *My Services*)
- Each field stage (Survey, Install, Handover) arrives as a Service assigned to the employee, with
  its verified Visit attached. Title in plain words: *"Install — Sharma, Sector 45, Gurugram"*.
- Opening it shows a checklist screen with three huge buttons in order: **Navigate** (opens Maps)
  → **Arrived** (only enabled inside the geofence) → **Take photos** (one tile per required
  photo, labelled "Roof", "Meter"…) → **Done**.
- Works offline: photos queue like check-in photos and upload when online (app-plan §1.5).
- After Done: **Share on WhatsApp** with the customer, one tap, skippable.

**Manager tab**
- *Projects*: a list grouped by stage (not a board — too wide for a phone), stuck ones first.
- Can Mark done the office stages (Design, Net meter, Commissioning, Subsidy) with a photo of the
  document straight from the camera.

### 5.3 Customer status page — option, not designed here

The **customer complaint link** being built (per-customer, unguessable public URL) can host a
second page on the same pattern: the 7 steps with ticks and the current status word, the next
expected step, a "Call us" button. No login, no amounts unless the owner says so (§9 Q7), no
staff names or photos beyond the "System live" one. Designed separately once the complaint link
ships.

---

## 6. Data model sketch — minimal, additive

**On Project** (only when `type: "onetime"` — installation jobs; recurring/AMC projects ignore it):

```
stage:        "survey" | "design" | "material" | "install" | "net_meter" | "commissioning" | "subsidy" | "done"
discom:       "bses_rajdhani" | "bses_yamuna" | "tata_ddl" | "dhbvn" | "pvvnl" | "other" | null
subsidyApplies: Boolean          // copied from Lead.subsidyApplicable on creation; editable
stages: [                        // always 7 entries, created with the project
  {
    key,                         // same values as `stage`
    status: "todo" | "done" | "skipped",
    ownerId,                     // ref User — who is responsible
    serviceId,                   // ref Service — field stages only
    visitId,                     // ref Visit — proof for field stages
    refNumber,                   // DISCOM / portal number, where the stage has one
    files: [fileRef],            // documents/photos not taken through a visit
    doneAt, doneById, note,
    sharedAt, sharedById         // last "Share on WhatsApp" tap
  }
]
paymentPlan: [ { stageKey, label, percent } ]   // §3 defaults; amount derived from Contract.amount
```

**Not duplicated — written through to Customer:** `roofType`, `connectionType`,
`estimatedCapacityKw`, `installedCapacityKw`, `commissioningDate`, panel/inverter brand + model,
warranty expiries, **`netMeteringStatus`** (Net meter stage's three taps *are* this field) and
**`subsidyClaimStatus`** (Subsidy stage *is* this field). Stage history lives in `stages[]`; no
separate `stageHistory` collection.

**On Payment:** one optional `projectId` (§3). Nothing else.

**Services (§7.72):** a field stage, when its owner is set, creates one Service for that employee
with the stage's photo list as subtasks; Project keeps the `serviceId`. The Service itself stays
customer- and project-agnostic as §7.72 decided — the link is one-way, from Project to Service.
Completing the Visit completes the Service and marks the stage done in one step.

**Visits:** the proof record for Survey, Install and Handover. The stage stores only `visitId`;
photos, coordinates and times stay on the Visit, under the same authenticated photo delivery as
attendance (§7.69).

**Files:** documents (design, certificate) go to the existing Cloudinary storage with authenticated
delivery, same as tickets/attendance photos.

**Permissions:** reuse `projects.view` / `projects.assign_team` for seeing and marking stages;
payment plan visible where `customers.view` already shows payments (§7.70); recording money stays
`payments.create`. No new permission keys unless the owner wants employees barred from marking
office stages.

---

## 7. Reuse vs new, phases, effort

| Reused as-is | New |
|---|---|
| Project (auto-created from Contract) | `stage`, `stages[]`, `discom`, `paymentPlan` on Project |
| Customer solar fields incl. `netMeteringStatus`, `subsidyClaimStatus` | Projects board + stage tracker (web) |
| Services + subtasks, app *My Services* | Stage → Service creation |
| Verified site visits (parallel build) | Visit attached to a stage; photo-label list per stage |
| Payments cash log, `collectedBy` | Optional `Payment.projectId`; due/short calculation |
| Notifications + FCM, cron pattern (`leadFollowUpReminderCron`) | `paymentDueReminderCron` |
| Cloudinary + authenticated delivery | — |
| Customer complaint link pattern (parallel build) | Status page (later) |

| Phase | Scope | Rough effort |
|---|---|---|
| 1 | Stage model on Project, web stage tracker with Mark done + file/ref proof, projects board | 3–4 days |
| 2 | Field stages via Services + verified Visits; app checklist screen | 3–4 days, **after Visits ships** |
| 3 | Payment plan, due/short display, reminder cron | 2–3 days |
| 4 | "Share on WhatsApp" buttons + editable message list | 1 day |
| 5 | Customer status page on the complaint-link pattern | 2 days, after that ships |
| Later | WhatsApp Cloud API — only on the owner's go | 1–2 weeks + Meta approval |

Phases 1, 3 and 4 do not depend on the parallel work and can go first.

---

## 8. Deliberately left out

- Per-DISCOM step-by-step workflows — one reference number field covers all five.
- Inventory/stock tracking — label photos are the record of what went on the roof.
- Storing customer bank details or Aadhaar — the customer enters those on the portal.
- Drag-and-drop between stages — stages move only with proof.
- Subsidy calculators with hard-coded rates.

---

## 9. Open questions for the owner

1. Payment split: keep 10% / 60% / 20% / 10% (booking / before material / install / commissioning), or what?
2. For subsidy customers, do you charge the full price and the customer gets the subsidy back — or do you discount it upfront?
3. If the material payment is short, should "Material dispatched" be blocked, or just warn?
4. Who handles DISCOM net-meter paperwork — a manager, or one named office employee?
5. Is the PM Surya Ghar portal application filed by Smartrays (as registered vendor) or by the customer with our help?
6. Are all one-time projects solar installations, or do some one-time projects need no stages?
7. Should the customer status page show amounts paid and due, or only the stage?
8. Do customers get the Hindi line by default, only on request, or never?
9. Is there a budget for automatic WhatsApp (Business Platform), or start with the free share button only?
10. What net-meter and commissioning times do you actually see per DISCOM (BSES R/Y, Tata-DDL, DHBVN, PVVNL)?
11. Do subsidy jobs always use DCR (domestic-content) panels, and should the CRM flag it if not?
12. Should state top-up subsidies (Delhi / Haryana / UP) be tracked as a separate line, or ignored?
13. Survey photos: are roof, meter and inverter spot enough, or do you want more?
14. Who may undo a done stage — only you, or managers too?
15. After "Subsidy received", should the message ask for a Google review (and what is the review link)?
