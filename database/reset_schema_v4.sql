begin;

create extension if not exists pgcrypto;

drop trigger if exists trg_orders_updated_at on orders;
drop trigger if exists trg_menu_items_updated_at on menu_items;
drop trigger if exists trg_customers_updated_at on customers;

drop function if exists set_updated_at() cascade;

drop table if exists order_items cascade;
drop table if exists orders cascade;
drop table if exists customer_addresses cascade;
drop table if exists customers cascade;
drop table if exists conversation_sessions cascade;
drop table if exists leads cascade;
drop table if exists campaigns cascade;
drop table if exists audit_log cascade;
drop table if exists app_settings cascade;
drop table if exists menu_items cascade;
drop table if exists messages_log cascade;
drop table if exists delivery_zones cascade;
drop table if exists messages cascade;
drop table if exists sessions cascade;
drop table if exists menu cascade;
drop table if exists settings cascade;
drop table if exists app_config cascade;
drop table if exists customers_log cascade;
drop table if exists orders_log cascade;

create table app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  phone text not null unique,
  preferred_language text not null default 'ar',
  consent_status text not null default 'service_only',
  marketing_opt_in boolean not null default false,
  notes text,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  address_text text not null,
  google_maps_url text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table menu_items (
  id text primary key,
  sku text not null unique,
  section_ar text not null,
  item_name_ar text not null,
  display_name_ar text not null,
  category_ar text,
  type_ar text,
  unit_ar text not null,
  unit_type text,
  unit_count numeric(10,2) default 1,
  price_1_jod numeric(10,3) not null,
  price_1_fils integer not null,
  status text not null,
  group_id text,
  review_needed boolean not null default false,
  review_note text,
  notes_ar text,
  source text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  current_state text not null default 'welcome',
  preferred_language text not null default 'ar',
  consent_status text not null default 'pending',
  last_menu_section text,
  session_data jsonb not null default '{}'::jsonb,
  last_order_id text,
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table delivery_zones (
  zone_id text primary key,
  zone_type text not null,
  sector_or_governorate text not null,
  zone_name_ar text not null,
  coverage_status text not null default 'available',
  sort_order integer,
  delivery_fee_jod numeric(10,3),
  min_order_jod numeric(10,3),
  estimated_minutes integer,
  same_day_allowed boolean not null default true,
  is_active boolean not null default true,
  notes text,
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'website',
  full_name text,
  phone text,
  preferred_channel text default 'whatsapp',
  notes text,
  created_at timestamptz not null default now()
);

create table orders (
  id text primary key,
  customer_id uuid references customers(id) on delete set null,
  customer_name text,
  phone text not null,
  status text not null default 'under_review',
  status_label_ar text not null default 'ط·ظ„ط¨ظƒ ظ‚ظٹط¯ ط§ظ„ظ…ط¹ط§ظ„ط¬ط©',
  delivery_type text not null default 'delivery',
  delivery_day text,
  delivery_slot text,
  delivery_sector text,
  delivery_zone_id text,
  delivery_zone_name text,
  payment_method text not null default 'cash',
  payment_status text not null default 'pending',
  address_text text,
  order_notes text,
  admin_notes text,
  subtotal_jod numeric(10,3) default 0,
  delivery_fee_jod numeric(10,3) default 0,
  total_jod numeric(10,3) default 0,
  approved_by_phone text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  menu_item_id text references menu_items(id) on delete set null,
  display_name_ar text not null,
  quantity numeric(10,2) not null default 1,
  unit_ar text,
  unit_price_jod numeric(10,3) default 0,
  line_total_jod numeric(10,3) default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table messages_log (
  id text primary key,
  channel text not null default 'whatsapp',
  direction text not null default 'inbound',
  phone text,
  message_type text not null default 'text',
  content text,
  media_id text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  channel text not null default 'whatsapp',
  campaign_type text not null,
  audience_rule jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  approval_status text not null default 'draft',
  approved_by_phone text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_phone text,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_customers_updated_at
before update on customers
for each row execute function set_updated_at();

create trigger trg_menu_items_updated_at
before update on menu_items
for each row execute function set_updated_at();

create trigger trg_orders_updated_at
before update on orders
for each row execute function set_updated_at();

create index idx_menu_items_section on menu_items(section_ar);
create index idx_menu_items_status on menu_items(status);
create index idx_orders_phone on orders(phone);
create index idx_orders_status on orders(status);
create index idx_messages_phone on messages_log(phone);
create index idx_delivery_zones_sector on delivery_zones(sector_or_governorate);
create index idx_delivery_zones_active on delivery_zones(is_active);
create index idx_conversation_sessions_phone on conversation_sessions(phone);

insert into app_settings (key, value)
values
  ('business_profile', jsonb_build_object(
    'app', 'ظ…ط·ط¨ط® ط§ظ„ظٹظˆظ… ط§ظ„ظ…ط±ظƒط²ظٹ',
    'business', 'ظ…ط·ط¨ط® ط§ظ„ظٹظˆظ… ط§ظ„ظ…ط±ظƒط²ظٹ',
    'timezone', 'Asia/Amman',
    'directCallPhone', '0779960015',
    'email', 'info@matbakh-alyoum.site',
    'city', 'ط¹ظ…ظ‘ط§ظ†',
    'district', 'ط£ظ… ط§ظ„ط³ظ…ط§ظ‚'
  )),
  ('order_window', jsonb_build_object(
    'start', '10:00',
    'lastSameDayOrder', '17:30',
    'lastDelivery', '18:30'
  )),
  ('delivery_slots', to_jsonb(array[
    '10:00-11:00',
    '11:00-12:30',
    '12:30-14:00',
    '14:00-15:30',
    '15:30-17:00',
    '17:00-18:30'
  ]::text[]));

commit;

NOTIFY pgrst, 'reload schema';

