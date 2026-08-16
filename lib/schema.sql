-- Prophase Data and Electrical — Portal schema
-- Run this once against your Postgres database (Vercel Storage > Neon > Query tab,
-- or `psql "$DATABASE_URL" -f lib/schema.sql`) before the app's first use.

create extension if not exists pgcrypto;

-- Prophase is a Sydney-based business, but Neon's session timezone is UTC —
-- and (confirmed by testing) an ALTER DATABASE ... SET timezone override
-- doesn't stick for this app's connections: the @neondatabase/serverless
-- HTTP driver's proxy re-injects its own session timezone per request
-- regardless of the database-level default. So the `default current_date`
-- below is a NOT-NULL safety net only — every app insert path explicitly
-- passes a Sydney-local date computed by lib/format.js's sydneyToday()
-- instead of relying on this default, since left to its own devices it
-- dates anything created between Sydney midnight and ~10am (AEST) a day
-- early (the UTC calendar date hasn't rolled over yet).

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin','manager','employee')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists counters (
  key text primary key,
  value int not null default 0
);
insert into counters (key, value) values ('quote', 0), ('job', 0), ('pay', 0), ('po', 0)
  on conflict (key) do nothing;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  email text default '',
  address text default '',
  lead_source text default '',
  created_at timestamptz not null default now()
);

-- Added for the client detail page's Overview/Notes tabs — the quick "+ New
-- Client" create flow deliberately still skips these two (kept lean), they
-- get filled in from the profile page afterward.
alter table clients add column if not exists company text default '';
alter table clients add column if not exists notes text default '';

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  model text default '',
  serial text default '',
  install_date date,
  warranty_expiry date,
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null,
  date date not null default current_date,
  client_id uuid references clients(id) on delete set null,
  client_name text not null,
  client_phone text default '',
  client_email text default '',
  client_address text default '',
  job_description text default '',
  tax_rate numeric not null default 0,
  discount numeric not null default 0,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'Draft',
  notes text default '',
  created_at timestamptz not null default now(),
  -- Employee-drafted quotes need manager/admin sign-off before they can be
  -- sent; quotes created by a manager/admin are auto-approved since they
  -- already have full authority. See app/api/quotes/[id]/review/route.js.
  approval_status text not null default 'Approved',
  -- Not a foreign key on purpose: backup restore never touches the users
  -- table, so a hard reference here could break a restore if the creating
  -- user was since deleted. created_by (a name snapshot) covers display.
  created_by_id uuid,
  created_by text default '',
  approval_note text default '',
  reviewed_by text default ''
);

-- Added for the tabbed Quote Details page. valid_until was previously just
-- computed on the fly as date+30 (see the print page) — now a real, editable
-- column, defaulted to date+30 at creation but overridable afterward.
-- internal_notes is admin/manager-only and never printed, unlike the
-- existing customer-facing `notes` field. updated_at is bumped on every PUT.
alter table quotes add column if not exists valid_until date;
alter table quotes add column if not exists internal_notes text default '';
alter table quotes add column if not exists updated_at timestamptz;

create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id) on delete cascade,
  description text not null default '',
  qty numeric not null default 1,
  price numeric not null default 0,
  sort_order int not null default 0
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  quote_id uuid references quotes(id),
  -- set null (not restrict) so deleting a client keeps their past quotes/
  -- jobs, per the delete-confirmation copy in clients-app.js — client_name
  -- below is the display fallback once client_id goes null.
  client_id uuid references clients(id) on delete set null,
  asset_id uuid references assets(id),
  client_name text not null,
  job_description text default '',
  scheduled_date date,
  status text not null default 'Quoted',
  priority text not null default 'Medium',
  job_type text not null default 'Quoted Job',
  amount_invoiced numeric not null default 0,
  -- Cached running total, kept in sync by app/api/jobs/[id]/payments — the
  -- source of truth is the job_payments table below; this column exists so
  -- list views don't need a join/sum on every render.
  amount_paid numeric not null default 0,
  notes text default '',
  created_date date not null default current_date,
  -- Stamped automatically when status first transitions to 'Complete' (see
  -- app/api/jobs/[id]/route.js), not user-editable. Drives the Workmanship
  -- Warranty document's completion/expiry dates.
  completed_date date,
  -- Who's doing the physical work — distinct from created_by-style fields
  -- elsewhere, which track authorship; this tracks assignment. Snapshot
  -- name alongside the FK so a deleted employee doesn't erase job history.
  assigned_to_id uuid references employees(id) on delete set null,
  assigned_to_name text default ''
);

-- Itemized invoice lines for a job — optional. When a job has at least one
-- of these, they're the computed source of truth for jobs.amount_invoiced
-- (subtotal + GST, read-only in the UI); when it has none, amount_invoiced
-- stays a plain manually-typed number. Mirrors quote_line_items (sell-side
-- pricing), not purchase_order_line_items (a supplier cost record).
create table if not exists job_line_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  description text not null default '',
  qty numeric not null default 1,
  price numeric not null default 0,
  sort_order int not null default 0
);

-- Payment history — see app/api/jobs/[id]/payments. Each row is one logged
-- payment; jobs.amount_paid is the running total these accumulate into,
-- the same "child rows drive a cached parent total" shape already used by
-- purchase_order_line_items.qty_received / parts.qty_on_hand.
create table if not exists job_payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null default 0,
  method text default '',
  note text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  hourly_rate numeric not null default 0,
  status text not null default 'Active',
  user_id uuid references users(id),
  license_number text default '',
  license_expiry date
);

create table if not exists payroll_entries (
  id uuid primary key default gen_random_uuid(),
  pay_number text not null,
  -- set null (not restrict) so deleting an employee keeps their past pay
  -- runs, per the delete-confirmation copy in payroll-app.js — employee_name
  -- below is the display fallback once employee_id goes null.
  employee_id uuid references employees(id) on delete set null,
  employee_name text not null,
  hourly_rate numeric not null default 0,
  date_paid date,
  period_start date,
  period_end date,
  gross_pay numeric not null default 0,
  net_pay numeric not null default 0,
  notes text default ''
);

create table if not exists payroll_allocations (
  id uuid primary key default gen_random_uuid(),
  payroll_entry_id uuid references payroll_entries(id) on delete cascade,
  job_id uuid references jobs(id),
  reg_hours numeric not null default 0,
  ot_hours numeric not null default 0
);

create table if not exists owner_draws (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  amount numeric not null default 0,
  note text default ''
);

create table if not exists parts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text default '',
  category text default '',
  supplier text default '',
  unit_cost numeric not null default 0,
  qty_on_hand numeric not null default 0,
  reorder_threshold numeric not null default 0,
  notes text default ''
);

-- Failed-login tracking for brute-force lockout (see app/api/auth/login).
create table if not exists login_attempts (
  key text primary key,
  count int not null default 0,
  first_failed_at timestamptz,
  locked_until timestamptz
);

-- Tax-deductible purchase receipts. Anyone can add one (photo is analyzed by
-- Claude to pre-fill these fields, then reviewed/edited before saving);
-- editing/deleting is restricted to admin/manager, same as other financial
-- records in this app.
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  vendor text not null default '',
  purchase_date date,
  amount numeric not null default 0,
  gst_amount numeric not null default 0,
  category text not null default 'Other',
  description text default '',
  image_url text not null,
  uploaded_by text not null default '',
  created_at timestamptz not null default now()
);

-- Certificates of Compliance, RCD/safety switch test records, and Test & Tag
-- records. Anyone can log one (they're usually the electrician who did the
-- work on-site); editing/deleting is restricted to admin/manager so these
-- legal/compliance records can't be altered after the fact.
create table if not exists compliance_records (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Certificate of Compliance',
  job_id uuid references jobs(id),
  client_id uuid references clients(id),
  employee_id uuid references employees(id),
  record_date date not null default current_date,
  reference_number text default '',
  result text default '',
  retest_due date,
  description text default '',
  file_url text,
  notes text default '',
  uploaded_by text not null default '',
  created_at timestamptz not null default now()
);

-- Business-wide license/insurance renewal dates — distinct from the
-- per-employee license register above. Always exactly one row (id=1);
-- read by anyone, edited by admin/manager only (see app/api/business-settings).
create table if not exists business_settings (
  id int primary key default 1,
  contractor_license_number text default '',
  contractor_license_expiry date,
  public_liability_provider text default '',
  public_liability_expiry date,
  workers_comp_provider text default '',
  workers_comp_expiry date,
  updated_by text default '',
  updated_at timestamptz default now(),
  constraint business_settings_single_row check (id = 1)
);
insert into business_settings (id) values (1) on conflict (id) do nothing;

-- Company identity and remittance details, added when documents moved from
-- browser print-to-PDF to generated PDFs. These aren't cosmetic: the ATO
-- requires a valid tax invoice to carry the supplier's identity and ABN, and
-- without bank details a customer receiving an invoice has no way to pay it.
-- legal_name is the entity that actually issues the invoice — it can differ
-- from the trading name shown in the app header, so it's stored separately
-- rather than assumed. All nullable/defaulted so an un-filled install still
-- renders a document (see lib/pdf/, which falls back to the trading name).
alter table business_settings add column if not exists legal_name text default '';
alter table business_settings add column if not exists abn text default '';
alter table business_settings add column if not exists address text default '';
alter table business_settings add column if not exists phone text default '';
alter table business_settings add column if not exists email text default '';
alter table business_settings add column if not exists website text default '';
alter table business_settings add column if not exists bank_name text default '';
alter table business_settings add column if not exists bank_bsb text default '';
alter table business_settings add column if not exists bank_account text default '';
-- Shown under the totals on an invoice, e.g. "Payment due within 14 days".
alter table business_settings add column if not exists payment_terms text default '';

-- Recurring service agreements (e.g. "Quarterly RCD Testing" for a
-- commercial client) — the mechanism for turning one-off job income into
-- a predictable, scheduled workload. next_due_date advances by `frequency`
-- each time a job is generated from the contract (see
-- app/api/maintenance-contracts/[id]/generate-job).
create table if not exists maintenance_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  client_name text not null,
  title text not null default '',
  description text default '',
  frequency text not null default 'Quarterly',
  start_date date not null default current_date,
  next_due_date date not null,
  amount numeric not null default 0,
  status text not null default 'Active',
  notes text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);

-- Wholesaler trade accounts (Middys, Rexel, L&H, etc.) — the "account
-- number" is Prophase's own customer/account number with that supplier,
-- not a login credential.
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_number text default '',
  contact_name text default '',
  phone text default '',
  email text default '',
  address text default '',
  payment_terms text default '',
  portal_url text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

-- Purchase orders for materials. Mirrors the quotes approval workflow
-- (see quotes.approval_status / app/api/quotes/[id]/review) — an
-- employee-drafted PO needs manager/admin sign-off before it can be sent
-- to the supplier, while a manager/admin's own PO is auto-approved.
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null,
  date date not null default current_date,
  supplier_id uuid references suppliers(id),
  supplier_name text not null,
  job_id uuid references jobs(id),
  job_number text default '',
  status text not null default 'Draft', -- Draft, Sent, Partially Received, Received, Cancelled
  subtotal numeric not null default 0,
  tax_rate numeric not null default 10,
  tax numeric not null default 0,
  total numeric not null default 0,
  notes text default '',
  created_at timestamptz not null default now(),
  approval_status text not null default 'Approved',
  created_by_id uuid,
  created_by text default '',
  approval_note text default '',
  reviewed_by text default ''
);

-- part_id is nullable: a line can point at an existing Spare Parts record
-- (receiving it bumps parts.qty_on_hand) or be a one-off item not tracked
-- in inventory. qty_received supports partial deliveries — see
-- app/api/purchase-orders/[id]/receive.
create table if not exists purchase_order_line_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  part_id uuid references parts(id),
  description text not null,
  qty numeric not null default 1,
  unit_cost numeric not null default 0,
  qty_received numeric not null default 0,
  sort_order int not null default 0
);

-- Numbers freed by a cancelled or deleted PO, available to be handed out
-- again before minting a brand new one (see nextPoNumber() in
-- app/api/purchase-orders/route.js and .../draft/route.js). Wholesalers
-- require a PO number up front before they'll give a price, so "New PO"
-- reserves one immediately rather than waiting for the form to be saved —
-- this pool is what stops that up-front reservation from permanently
-- burning a number if the PO never ends up getting used.
create table if not exists po_number_pool (
  po_number text primary key,
  released_at timestamptz not null default now()
);

-- Belt-and-suspenders: the pool-then-counter logic in nextPoNumber() should
-- already guarantee every po_number is unique, but this makes a bug there
-- fail loudly (a rejected insert) instead of silently letting two live POs
-- share the same number — which is exactly the scenario a wholesaler-facing
-- number exists to prevent.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_po_number_unique') then
    alter table purchase_orders add constraint purchase_orders_po_number_unique unique (po_number);
  end if;
end
$$;

-- A supplier's actual invoice for a delivery against a PO — logged in the
-- same action as Receive Items (see app/api/purchase-orders/[id]/receive)
-- since in practice the goods and the paperwork arrive together. Give the
-- supplier the po_number; when their invoice references it, this is where
-- it gets recorded. purchase_orders.total is what WE ordered for; this is
-- what the supplier actually billed — kept separate since price/freight/
-- partial-shipment differences are common and shouldn't silently overwrite
-- the PO's own total.
create table if not exists purchase_order_invoices (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  invoice_number text not null default '',
  invoice_date date not null default current_date,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  amount_paid numeric not null default 0,
  status text not null default 'Unpaid', -- Unpaid, Partially Paid, Paid
  notes text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);

-- Mirrors purchase_order_line_items but independently editable — pre-filled
-- from the PO's own lines (description + unit_cost) when the invoice is
-- logged, then adjustable to match what the supplier actually billed.
-- po_line_item_id links back so the UI can flag a line where the invoiced
-- price differs from what was ordered.
create table if not exists purchase_order_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_invoice_id uuid not null references purchase_order_invoices(id) on delete cascade,
  po_line_item_id uuid references purchase_order_line_items(id) on delete set null,
  description text not null default '',
  qty numeric not null default 0,
  unit_cost numeric not null default 0,
  sort_order int not null default 0
);

-- amount_paid on purchase_order_invoices is a cached running total kept in
-- sync by this table's rows, same shape as job_payments / jobs.amount_paid.
create table if not exists purchase_order_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_invoice_id uuid not null references purchase_order_invoices(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null default 0,
  method text default '',
  note text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);

-- Job Details redesign additions.
alter table jobs add column if not exists job_title text default '';
alter table jobs add column if not exists site_address text default '';
alter table jobs add column if not exists start_date date;
alter table jobs add column if not exists estimated_hours numeric;
-- Customer-facing notes, separate from the existing `notes` column which is
-- now treated as internal-only now that the Job Details page distinguishes
-- the two audiences explicitly.
alter table jobs add column if not exists customer_notes text default '';
alter table jobs add column if not exists updated_at timestamptz;

-- True multi-technician assignment. jobs.assigned_to_id/assigned_to_name
-- stay in place as a cheap "first assignee" cache for the handful of older
-- call sites that just want a display string (e.g. Client Details' Jobs
-- tab), kept in sync by app/api/jobs whenever this table changes — this
-- table is the actual source of truth for who's assigned.
create table if not exists job_assignees (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  employee_name text not null default ''
);

-- Photos, documents, and permits attached to a job. Mirrors compliance_
-- records' file_url/@vercel-blob pattern, but as its own table since a job
-- can carry many files (compliance_records is one file per record).
create table if not exists job_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  label text not null default '',
  category text not null default 'Photo',
  file_url text not null,
  uploaded_by text not null default '',
  created_at timestamptz not null default now()
);

-- Combined activity feed for the Job Details page's History tab — system-
-- generated rows (status/priority changes, stamped automatically by
-- app/api/jobs/[id]) interleaved with manually-added progress-update notes,
-- ordered by created_at. type is 'status_change' | 'priority_change' | 'note'.
create table if not exists job_activity (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  type text not null default 'note',
  message text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

-- Purchase Order System Restructure.
alter table purchase_orders add column if not exists client_id uuid references clients(id) on delete set null;
alter table purchase_orders add column if not exists client_name text default '';
alter table purchase_orders add column if not exists asset_id uuid references assets(id) on delete set null;
alter table purchase_orders add column if not exists quote_id uuid references quotes(id);
alter table purchase_orders add column if not exists assigned_to_id uuid references employees(id) on delete set null;
alter table purchase_orders add column if not exists assigned_to_name text default '';
alter table purchase_orders add column if not exists delivery_method text default '';
alter table purchase_orders add column if not exists delivery_address text default '';
alter table purchase_orders add column if not exists expected_delivery_date date;
alter table purchase_orders add column if not exists delivery_notes text default '';
alter table purchase_orders add column if not exists updated_at timestamptz;

-- Status vocabulary expands from Draft/Sent/Partially Received/Received/
-- Cancelled to Draft/Ordered/Partially Received/Received/Invoiced/Completed/
-- Cancelled. 'Invoiced' and 'Completed' are set automatically (by the receive
-- route and the invoice-payment route respectively) but stay manually
-- overridable, same as everything else in this table. No live data needed
-- migrating for the Sent->Ordered rename — see the one-off update below.
update purchase_orders set status = 'Ordered' where status = 'Sent';

-- Supplier's own code for the item, distinct from this app's internal Spare
-- Parts SKU — lets an imported invoice line match back to a PO line even
-- when the free-text description wording differs slightly.
alter table purchase_order_line_items add column if not exists supplier_product_code text default '';

-- delivery_charge/discount are their own fields (not folded into subtotal)
-- so the cost summary can show them as distinct lines, matching how a real
-- supplier invoice itemizes them. source records how the invoice entered the
-- system ('manual' | 'ai_import'), source_file_url keeps the uploaded
-- PDF/photo for audit purposes when it came in via AI import.
alter table purchase_order_invoices add column if not exists delivery_charge numeric not null default 0;
alter table purchase_order_invoices add column if not exists discount numeric not null default 0;
alter table purchase_order_invoices add column if not exists source text not null default 'manual';
alter table purchase_order_invoices add column if not exists source_file_url text;

alter table purchase_order_invoice_line_items add column if not exists supplier_product_code text default '';

-- Purchase-cost tracking on Spare Parts — last_purchase_cost/avg_purchase_cost
-- and the last supplier are kept in sync by app/api/purchase-orders/[id]/
-- receive whenever a line tied to inventory is received, the same
-- "child action updates a cached parent total" shape used throughout this
-- app (jobs.amount_paid, purchase_order_invoices.amount_paid, etc).
alter table parts add column if not exists last_purchase_cost numeric;
alter table parts add column if not exists avg_purchase_cost numeric;
alter table parts add column if not exists last_purchase_supplier_id uuid references suppliers(id);
alter table parts add column if not exists last_purchase_supplier_name text default '';
-- Only parts explicitly flagged need a serial/batch prompt on receive —
-- most stock (cable, connectors, breakers bought in bulk) has no individual
-- identity worth tracking.
alter table parts add column if not exists track_serials boolean not null default false;

create table if not exists part_serials (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references parts(id) on delete cascade,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  serial_number text not null default '',
  batch_number text not null default '',
  status text not null default 'In Stock', -- In Stock, Used, Returned
  job_id uuid references jobs(id) on delete set null,
  received_date date not null default current_date,
  notes text default '',
  created_at timestamptz not null default now()
);

-- Photos/documents/delivery dockets attached to a PO — same shape as
-- job_documents.
create table if not exists po_documents (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  label text not null default '',
  category text not null default 'Document',
  file_url text not null,
  uploaded_by text not null default '',
  created_at timestamptz not null default now()
);

-- Combined activity/approval-history feed for the PO Details page's History
-- tab — same shape as job_activity. type is 'status_change' |
-- 'approval' | 'note' | 'invoice_matched' | 'mismatch_flag'.
create table if not exists po_activity (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  type text not null default 'note',
  message text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

-- Self-service hours worked, logged directly against a job by the employee
-- who did the work — distinct from payroll_allocations, which is the
-- admin/manager-entered figure tied to an actual pay run. Kept as two
-- separate sources deliberately: this table is the field-reported "what did
-- I actually do today" log (visible to everyone, shown as Logged Hours),
-- while payroll_allocations stays the sole source for labor $ cost and
-- Statistics, so a self-logged entry can never silently affect pay or
-- margin figures without a manager processing it through Payroll.
create table if not exists job_hour_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  employee_name text not null default '',
  date date not null default current_date,
  hours numeric not null default 0,
  notes text default '',
  created_by text default '',
  created_at timestamptz not null default now()
);

-- Review/payment lifecycle, added so an approved entry's hours can pre-fill
-- a pay run's job allocations instead of being re-typed — and so nothing
-- gets paid twice. Pending -> Approved (an admin/director confirms both the
-- hours and, since employee_id is very often null on a self-logged entry,
-- resolves exactly which employee they belong to) or Rejected -> Paid (set
-- automatically once pulled into a saved pay run, alongside payroll_entry_id
-- linking back to it). payroll_allocations remains the only thing that
-- feeds labor $ cost / Statistics — these columns never do on their own.
alter table job_hour_logs add column if not exists status text not null default 'Pending';
alter table job_hour_logs add column if not exists reviewed_by text default '';
alter table job_hour_logs add column if not exists reviewed_at timestamptz;
alter table job_hour_logs add column if not exists review_note text default '';
alter table job_hour_logs add column if not exists payroll_entry_id uuid references payroll_entries(id) on delete set null;
create index if not exists job_hour_logs_status_idx on job_hour_logs (status, employee_id);

-- Director/Subadmin roles. 'admin' is kept in the allowed list purely for
-- backward compatibility with old backup files and any stray row — no new
-- admin accounts are created going forward, only director/subadmin/manager/
-- employee. Director sits above admin (full access, plus approval authority
-- over a subadmin's gated actions); subadmin has the same day-to-day
-- capabilities admin/manager always had, except the specific actions listed
-- in lib/approvals.js's GATED_ACTIONS, which become a pending request
-- instead of executing immediately.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('director', 'subadmin', 'admin', 'manager', 'employee'));

-- Generic pending-approval queue. One table, not one per action type — a
-- subadmin's gated action inserts a row here (via lib/approvals.js's
-- gateOrExecute) instead of running immediately; a director reviewing and
-- approving it re-runs the same performer function that would have executed
-- directly for a director/manager. target_label is a plain-English
-- description for display (e.g. "Delete client: Brasilero") since the
-- underlying record may reference several different tables depending on
-- action_type. payload carries whatever the performer function needs beyond
-- target_id (e.g. a quote review's decision/note, a new user's fields).
create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_id uuid,
  target_label text not null default '',
  payload jsonb not null default '{}',
  status text not null default 'Pending', -- Pending, Approved, Rejected, Cancelled
  requested_by_id uuid,
  requested_by text not null default '',
  reviewed_by text default '',
  review_note text default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- One generic log for every emailed document (a quote or a job tax invoice),
-- rather than a separate table per document type — mirrors approval_requests'
-- reasoning. document_id isn't a foreign key: a quote and a job are
-- different tables, and this row should survive as an audit trail even if
-- the source record is later deleted. document_label is a display snapshot
-- (quote/job number) for the same reason. Read by the History tab on the
-- quote/job detail page, filtered by document_type + document_id.
create table if not exists document_sends (
  id uuid primary key default gen_random_uuid(),
  document_type text not null, -- 'quote' | 'invoice'
  document_id uuid not null,
  document_label text not null default '',
  recipient_email text not null,
  recipient_name text default '',
  subject text not null default '',
  body text default '',
  status text not null default 'Sent', -- 'Sent' | 'Failed'
  error_message text default '',
  sent_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists document_sends_lookup_idx on document_sends (document_type, document_id);
