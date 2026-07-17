-- Prophase Data and Electrical — Portal schema
-- Run this once against your Postgres database (Vercel Storage > Neon > Query tab,
-- or `psql "$DATABASE_URL" -f lib/schema.sql`) before the app's first use.

create extension if not exists pgcrypto;

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
  amount_paid numeric not null default 0,
  notes text default '',
  created_date date not null default current_date,
  -- Stamped automatically when status first transitions to 'Complete' (see
  -- app/api/jobs/[id]/route.js), not user-editable. Drives the Workmanship
  -- Warranty document's completion/expiry dates.
  completed_date date
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
