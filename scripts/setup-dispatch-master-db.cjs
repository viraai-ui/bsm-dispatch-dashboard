const fs = require('fs')
const { Client } = require('pg')

const databaseUrl = process.env.DATABASE_URL || fs.readFileSync('/tmp/bsm_dispatch_database_url.txt', 'utf8').trim()

const sql = `
create extension if not exists pgcrypto;

create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  serial_number text unique not null,
  sales_order_number text,
  zoho_sales_order_id text,
  customer_name text not null,
  shipping_address text,
  model_no text,
  make text,
  date_of_purchase date,
  warranty_start date,
  warranty_end date,
  source text not null default 'dashboard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dispatches (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references machines(id) on delete cascade,
  status text not null default 'dispatched',
  dispatched_at timestamptz,
  vehicle_number text,
  transporter_name text,
  lr_number text,
  bilty_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references machines(id) on delete cascade,
  asset_type text not null,
  url text not null,
  provider text not null default 'r2',
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists audit_logs (
  id bigserial primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_machines_serial_number on machines(serial_number);
create index if not exists idx_machines_sales_order_number on machines(sales_order_number);
create index if not exists idx_machines_customer_name on machines(customer_name);
create index if not exists idx_dispatches_machine_id on dispatches(machine_id);
create index if not exists idx_media_assets_machine_id on media_assets(machine_id);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
`

async function main() {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  await client.query(sql)
  const result = await client.query(`select table_name from information_schema.tables where table_schema='public' order by table_name`)
  await client.end()
  console.log(JSON.stringify({ ok: true, tables: result.rows.map((row) => row.table_name) }, null, 2))
}

main().catch((error) => { console.error(error.message); process.exit(1) })
