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
insert into counters (key, value) values ('quote', 0), ('job', 0), ('pay', 0)
  on conflict (key) do nothing;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  email text default '',
  address text default '',
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
  client_id uuid references clients(id),
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
  created_at timestamptz not null default now()
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
  client_id uuid references clients(id),
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
  created_date date not null default current_date
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text default '',
  hourly_rate numeric not null default 0,
  status text not null default 'Active',
  user_id uuid references users(id)
);

create table if not exists payroll_entries (
  id uuid primary key default gen_random_uuid(),
  pay_number text not null,
  employee_id uuid references employees(id),
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
