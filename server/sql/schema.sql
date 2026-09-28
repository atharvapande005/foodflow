-- FoodFlow database schema (Supabase / PostgreSQL)
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query) once.

-- 1. Menu items available in the canteen
create table if not exists menu_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  price        numeric(10, 2) not null check (price >= 0),
  category     text,               -- e.g. 'snacks', 'meals', 'beverages'
  image_url    text,
  is_available boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2. One row per student order
create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  token_number   integer not null unique,        -- what the student is called by at the counter
  student_name   text,
  student_email  text,
  total_amount   numeric(10, 2) not null check (total_amount >= 0),
  status         text not null default 'pending'
                 check (status in ('pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled')),
  payment_status text not null default 'unpaid'
                 check (payment_status in ('unpaid', 'paid', 'failed', 'refunded')),
  razorpay_order_id   text,
  razorpay_payment_id text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 3. Line items belonging to an order (order <-> menu_items, many-to-many via this table)
create table if not exists order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  menu_item_id  uuid not null references menu_items(id),
  item_name     text not null,     -- snapshot of the name at order time (menu can change later)
  item_price    numeric(10, 2) not null,   -- snapshot of the price at order time
  quantity      integer not null check (quantity > 0),
  subtotal      numeric(10, 2) not null
);

-- 4. Sequential token counter (so two students never get the same token)
--    A single row is used as a simple counter. Increment it atomically via a Postgres function.
create table if not exists token_counter (
  id            integer primary key default 1,
  current_value integer not null default 100,
  constraint single_row check (id = 1)
);
insert into token_counter (id, current_value)
  values (1, 100)
  on conflict (id) do nothing;

-- Atomically get the next token number (safe under concurrent orders)
create or replace function next_token_number()
returns integer
language plpgsql
as $$
declare
  next_val integer;
begin
  update token_counter
    set current_value = current_value + 1
    where id = 1
    returning current_value into next_val;
  return next_val;
end;
$$;

-- 5. Canteen-wide state (e.g. is the canteen currently open/accepting orders)
create table if not exists canteen_state (
  id           integer primary key default 1,
  is_open      boolean not null default true,
  message      text,              -- optional note shown to students, e.g. "Closed for cleaning"
  updated_at   timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into canteen_state (id, is_open)
  values (1, true)
  on conflict (id) do nothing;
