
# Leads & Customer Module — Functional Specification
## The Tous CRM (crm.thetous.com)

---

## LEADS MODULE

### Overview
Pipeline-based lead management with board (kanban) and table views, follow-up scheduling, call logging, and conversion to customer.

### Data Model — `leads` table
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | Contact person name |
| email | text | Nullable |
| phone | text | |
| company_name | text | Business name |
| source | text | Where the lead came from (Meta Ads, Website, Referral, BNI, Cold Call, Walk-in, etc.) |
| status | text | Pipeline stage: `new`, `contacted`, `qualified`, `proposal_sent`, `negotiation`, `won`, `lost` |
| owner_id | uuid | FK → profiles (assigned salesperson) |
| follow_up_date | timestamptz | Next follow-up date/time |
| follow_up_note | text | Note for the follow-up |
| is_hot | boolean | Hot deal flag |
| notes | text | General notes |
| lost_reason | text | Filled when marked as lost |
| budget | numeric | Expected deal value |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Pipeline Stages (in order)
1. **New** — just entered the system
2. **Contacted** — first contact made
3. **Qualified** — confirmed interest/budget/fit
4. **Proposal Sent** — quote/proposal shared
5. **Negotiation** — discussing terms
6. **Won** — converted (triggers conversion to customer)
7. **Lost** — dead lead (requires lost_reason)

### Views
1. **Table View** — sortable/filterable list with columns: Name, Company, Status, Source, Owner, Follow-up, Budget, Created
2. **Board View** — kanban-style columns for each pipeline stage, drag to move between stages

### Filters
- **Search** — text search across name, company_name, email, phone
- **Owner filter** — dropdown of all team members ("All owners" default)
- **Follow-up filter** — dropdown: All, Today, Overdue, This Week, No Follow-up

### Actions on a Lead

#### Quick Actions (from list/board)
- Change pipeline stage (drag on board, or status dropdown on table)
- Assign owner

#### Detail View Actions (7 buttons on mobile, more on desktop)
- **Log Call** — opens a call log form: date, duration, outcome (connected/no answer/voicemail/callback), notes. Saved to `lead_calls` table.
- **Mark as Hot** / **Remove as Hot** — toggles `is_hot` flag. Hot leads show a 🔥 indicator.
- **Won** — marks lead as won, triggers "Convert to Customer" flow
- **Lost** — asks for lost_reason, marks status as `lost`
- **Convert to Customer** — creates a new company record from lead data (name, email, phone, company_name). Optionally carries over notes. Lead is archived.
- **Edit** — opens edit form with all lead fields
- **Delete** — soft or hard delete with confirmation

#### Lead Detail Fields (slide-over panel)
- Name, Email, Phone, Company Name
- Source
- Status (pipeline stage)
- Owner (assignee)
- Budget
- Follow-up Date + Note
- Notes (general)
- Call History (list of logged calls)
- Activity Timeline

### Follow-up System
- Each lead can have ONE next follow-up date + note
- Follow-ups show in the filter ("Today", "Overdue")
- Push notifications: 24 hours before and 15 minutes before follow-up (via cron)
- Overdue follow-ups highlighted in red

### Lead Sources
Configurable list: Meta Ads, Google Ads, Website, Referral, BNI, Cold Call, Walk-in, LinkedIn, Clutch, Other

### Lead Import
- CSV import functionality
- Maps columns to lead fields
- Bulk creates leads

### Notifications
- Push notification when a lead is assigned to you
- Push notification for upcoming follow-ups (24h and 15min before)

### Permissions
- `leads.view` — see all leads (or just owned, based on role)
- `leads.create` — add new leads
- `leads.edit` — modify lead details
- `leads.delete` — remove leads

---

## CUSTOMER MODULE

### Overview
Customer (company) management with contacts, contracts, billing, invoice history, credentials vault, and activity log. Linked to Projects, Invoicing, and Recurring profiles.

### Data Model — `companies` table
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| company_name | text | Business name |
| type | text | `customer` or `lead` (companies table serves both) |
| customer_status | text | `active` or `inactive` |
| billing_type | text | `registered` (GST), `non_gst`, `overseas` |
| billing_name | text | Legal/billing name |
| billing_address | text | |
| billing_state | text | State code for GST (e.g., "07 Delhi") |
| gstin | text | GST number |
| phone | text | |
| email | text | |
| website | text | |
| industry | text | |
| owner_id | uuid | FK → profiles (account manager) |
| source | text | How the customer was acquired |
| signed_up | date | When they became a customer |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Related Tables

#### `contacts` table (multiple contacts per company)
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| company_id | uuid | FK → companies |
| name | text | Contact person name |
| email | text | |
| phone | text | |
| designation | text | Job title |
| is_primary | boolean | Primary contact flag |

#### `contracts` table (billing contracts)
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| company_id | uuid | FK → companies |
| type | text | `monthly`, `onetime`, `yearly` |
| amount | numeric | Contract value |
| label | text | Description (e.g., "Website", "Social Media Mgmt") |
| renewal_date | date | For yearly contracts |
| term_years | integer | Contract duration |

#### `credentials` table (login credentials vault)
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| company_id | uuid | FK → companies |
| service | text | Service name (e.g., "Hosting", "Domain", "Meta Ads") |
| username | text | |
| password | text | Stored encrypted or plain |
| url | text | Login URL |
| notes | text | |

### Customer List View

#### Columns
- Company Name, Owner, Type badges (Monthly/One-time/Yearly), Source, Signed Up date, Status (Active/Inactive)

#### Filters
- Search — text search across company_name, contacts
- Owner filter — "All owners" dropdown
- Status filter — Active, Inactive, All
- Show Inactive checkbox

#### Bulk Actions
- Select multiple with checkboxes
- Bulk Mark Active / Mark Inactive / Delete
- Select All toggle

#### Sorting
- Date column sortable (ascending/descending arrow)

### Customer Detail Page

#### Header Section
- Company name, Status badge (Active/Inactive), Edit button, Delete button
- Source, Owner, Signed Up date

#### Billing Details Card
- Billing Type (GST Registered / Non-GST / Overseas)
- Billing Name, GSTIN, Billing Address
- Edit billing button

#### Contracts Section
- List of all contracts (monthly, one-time, yearly)
- Each shows: type, amount, label, renewal date
- Add/edit/remove contracts
- **Automation:** Adding a monthly contract auto-creates a recurring project + recurring invoice profile
- **Automation:** Adding a one-time contract auto-creates a one-time project + draft invoice
- **Automation:** Deleting a contract completes the linked project and pauses recurring profile

#### Contacts Section
- List of contact persons for this company
- Each: name, email, phone, designation, primary flag
- Add/edit/remove contacts

#### Credentials Vault
- List of saved login credentials
- Each: service name, username, password (masked, click to reveal), URL, notes
- Add/edit/remove credentials
- Permission-gated: only visible to users with `credentials.view` permission

#### Invoice History
- Table of all invoices for this customer
- Columns: Date, Proforma/Invoice number, Status, Amount, Balance, GST Invoice link
- "View Ledger" button — opens ledger view with date range filter (defaults to current FY)
- "+ Create Invoice" button

#### Activity Log
- Timeline of actions on this customer: created, edited, invoice sent, payment received, etc.
- Excludes project timer entries (filtered out)

### Customer Creation Flow

#### From Scratch
1. Click "+ Add Customer"
2. Fill form: Company Name, Email, Phone, Website, Industry, Owner, Source, Billing Type
3. Add Contracts (optional): type (monthly/onetime/yearly), amount, label
4. Add Contacts (optional): name, email, phone, designation
5. Save → creates company + contracts + contacts
6. **Auto-triggers:** project + recurring profile (monthly) or project + draft invoice (one-time)

#### From Lead Conversion
1. On lead detail, click "Convert to Customer"
2. Pre-fills: company_name, name, email, phone from lead
3. Add billing details + contracts
4. Save → creates customer, archives lead

### Customer Deactivation
- Setting customer_status to `inactive`:
  - All active projects → completed
  - All recurring profiles → paused
  - No more auto-generated invoices

### Permissions
- `customers.view` — see all customers
- `customers.create` — add new customers
- `customers.edit` — modify customer details
- `customers.delete` — remove customers
- `credentials.view` — see credentials vault (requires customers.view)
- `credentials.create` — add credentials
- `credentials.edit` — edit credentials
- `credentials.delete` — remove credentials

---

## TECH STACK
- **Frontend:** Next.js App Router, React, Tailwind CSS
- **Backend:** Next.js Server Components + Server Actions
- **Database:** Supabase (PostgreSQL) with RLS
- **Auth:** Supabase Auth (email/password + MFA)
- **Hosting:** Vercel
- **Push Notifications:** Web Push (VAPID) via PWA service worker

## KEY PATTERNS
- Server components fetch data, client components handle interaction
- `adminClient` (service role) bypasses RLS for non-admin users with app-level permissions
- `can(role, permissions, module, action)` helper for permission checks
- `Promise.all()` for parallel database queries (performance)
- JSONB `permissions` column on profiles for granular module access
- Contracts → Projects → Recurring Profiles automation chain

---

*Generated from The Tous CRM codebase — July 2026*
