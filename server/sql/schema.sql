-- =====================================================================
-- FoodFlow — PostgreSQL / Supabase schema
-- ---------------------------------------------------------------------
-- HOW TO APPLY
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--   (or: psql "$SUPABASE_DB_URL" -f server/sql/schema.sql)
--
-- This script is IDEMPOTENT and ADDITIVE. It is safe to run on a brand
-- new project and safe to re-run on an existing one: new tables use
-- CREATE TABLE IF NOT EXISTS and new columns use ADD COLUMN IF NOT
-- EXISTS, so previously entered data is never dropped.
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. MENU ITEMS
-- =====================================================================
create table if not exists menu_items (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  price            numeric(10, 2) not null check (price >= 0),
  category         text not null default 'snacks',
  image_url        text,
  is_veg           boolean not null default true,
  is_spicy         boolean not null default false,
  prep_time_minutes integer not null default 10 check (prep_time_minutes >= 0),
  calories         integer check (calories is null or calories >= 0),
  tags             text[] not null default '{}',
  is_available     boolean not null default true,
  -- Denormalised review aggregates, kept in sync by a trigger on `reviews`.
  rating_avg       numeric(3, 2) not null default 0,
  rating_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Additive migrations. `create table if not exists` above does nothing on a
-- database created by an older version of this file, so every column the API
-- relies on is added explicitly here.
alter table menu_items add column if not exists description text;
alter table menu_items add column if not exists image_url text;
alter table menu_items add column if not exists is_veg boolean not null default true;
alter table menu_items add column if not exists is_spicy boolean not null default false;
alter table menu_items add column if not exists prep_time_minutes integer not null default 10;
alter table menu_items add column if not exists calories integer;
alter table menu_items add column if not exists tags text[] not null default '{}';
alter table menu_items add column if not exists rating_avg numeric(3, 2) not null default 0;
alter table menu_items add column if not exists rating_count integer not null default 0;

create index if not exists idx_menu_items_category on menu_items (category);
create index if not exists idx_menu_items_available on menu_items (is_available);

-- Keep updated_at honest even for writes that bypass the API.
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_menu_items_updated_at on menu_items;
create trigger trg_menu_items_updated_at
  before update on menu_items
  for each row execute function touch_updated_at();

-- =====================================================================
-- 2. CANTEEN STATE  (open / closed banner shown to every student)
-- =====================================================================
create table if not exists canteen_state (
  id          integer primary key default 1,
  is_open     boolean not null default true,
  message     text,
  accepting_orders boolean not null default true,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  constraint single_row_canteen check (id = 1)
);
insert into canteen_state (id, is_open) values (1, true) on conflict (id) do nothing;

alter table canteen_state add column if not exists accepting_orders boolean not null default true;
alter table canteen_state add column if not exists updated_by text;

-- =====================================================================
-- 3. ORDERS
-- =====================================================================
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  token_number    integer not null unique,
  user_id         uuid,
  student_name    text,
  student_email   text,
  student_phone   text,
  pickup_location text,
  notes           text,
  -- Money breakdown. subtotal = sum of line items, discount comes from a
  -- coupon, packing is a flat fee. total is always the authoritative amount.
  subtotal_amount numeric(10, 2) not null default 0 check (subtotal_amount >= 0),
  discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
  packing_fee     numeric(10, 2) not null default 0 check (packing_fee >= 0),
  total_amount    numeric(10, 2) not null default 0 check (total_amount >= 0),
  coupon_code     text,
  items_count     integer not null default 0,
  status          text not null default 'pending'
                   check (status in ('pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled')),
  payment_status  text not null default 'unpaid'
                   check (payment_status in ('unpaid', 'paid', 'failed', 'refunded')),
  payment_method  text not null default 'razorpay'
                   check (payment_method in ('razorpay', 'simulated')),
  razorpay_order_id   text,
  razorpay_payment_id text,
  razorpay_signature  text,
  cancel_reason   text,
  paid_at         timestamptz,
  ready_at        timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Additive columns for databases created before coupons existed.
alter table orders add column if not exists user_id uuid;
alter table orders add column if not exists student_phone text;
alter table orders add column if not exists pickup_location text;
alter table orders add column if not exists notes text;
alter table orders add column if not exists subtotal_amount numeric(10, 2) not null default 0;
alter table orders add column if not exists discount_amount numeric(10, 2) not null default 0;
alter table orders add column if not exists packing_fee numeric(10, 2) not null default 0;
alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists items_count integer not null default 0;
alter table orders add column if not exists payment_method text not null default 'razorpay';
alter table orders add column if not exists razorpay_signature text;
alter table orders add column if not exists cancel_reason text;
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists ready_at timestamptz;
alter table orders add column if not exists completed_at timestamptz;
-- Set when a student cancels an order whose payment was already captured. The
-- canteen portal turns this into a real Razorpay refund; it never means
-- "money returned" on its own.
alter table orders add column if not exists refund_required boolean not null default false;

create index if not exists idx_orders_created_at on orders (created_at desc);
create index if not exists idx_orders_status on orders (status);
create index if not exists idx_orders_user_id on orders (user_id);
create index if not exists idx_orders_token on orders (token_number);

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
  before update on orders
  for each row execute function touch_updated_at();

-- =====================================================================
-- 4. ORDER ITEMS  (line items, with name/price snapshots)
-- =====================================================================
create table if not exists order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  menu_item_id  uuid not null references menu_items(id),
  item_name     text not null,
  item_price    numeric(10, 2) not null check (item_price >= 0),
  item_category text,
  quantity      integer not null check (quantity > 0),
  subtotal      numeric(10, 2) not null check (subtotal >= 0)
);

alter table order_items add column if not exists item_category text;

create index if not exists idx_order_items_order_id on order_items (order_id);
create index if not exists idx_order_items_menu_item_id on order_items (menu_item_id);

-- =====================================================================
-- 5. ORDER STATUS HISTORY  (timeline shown on the tracking page)
-- =====================================================================
create table if not exists order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  status     text not null,
  note       text,
  actor      text not null default 'system',
  created_at timestamptz not null default now()
);

create index if not exists idx_order_status_history_order on order_status_history (order_id, created_at);

create or replace function log_order_status_change()
returns trigger
language plpgsql
as $$
declare
  v_actor text := case
    when new.cancel_reason is not null then 'student'
    when old.status = 'pending' and new.payment_status = 'paid' then 'payment_gateway'
    else 'canteen_admin'
  end;
begin
  if new.status is distinct from old.status then
    insert into order_status_history (order_id, status, actor, note)
    values (new.id, new.status, v_actor, new.cancel_reason);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_status_history on orders;
create trigger trg_orders_status_history
  after update of status on orders
  for each row execute function log_order_status_change();

-- Also record the very first status when a row is inserted.
create or replace function log_order_creation()
returns trigger
language plpgsql
as $$
begin
  insert into order_status_history (order_id, status, actor)
  values (new.id, new.status, 'student');
  return new;
end;
$$;

drop trigger if exists trg_orders_status_created on orders;
create trigger trg_orders_status_created
  after insert on orders
  for each row execute function log_order_creation();

-- =====================================================================
-- 6. TOKEN COUNTER  (what the student is called at the counter)
-- =====================================================================
create table if not exists token_counter (
  id            integer primary key default 1,
  current_value integer not null default 100,
  constraint single_row_token check (id = 1)
);
insert into token_counter (id, current_value) values (1, 100) on conflict (id) do nothing;

-- =====================================================================
-- 7. COUPONS  (the coupon engine's rule store)
-- =====================================================================
create table if not exists coupons (
  code                  text primary key,
  description           text,
  discount_type         text not null default 'percent'
                          check (discount_type in ('percent', 'flat', 'free_delivery')),
  value                 numeric(10, 2) not null default 0 check (value >= 0),
  max_discount          numeric(10, 2) check (max_discount is null or max_discount > 0),
  min_order_amount      numeric(10, 2) not null default 0 check (min_order_amount >= 0),
  applies_to_category   text,          -- null = applies to the whole cart
  starts_at             timestamptz,
  ends_at               timestamptz,
  usage_limit           integer check (usage_limit is null or usage_limit > 0),
  usage_limit_per_user  integer check (usage_limit_per_user is null or usage_limit_per_user > 0),
  used_count            integer not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint coupons_code_format check (code ~ '^[A-Z0-9_-]{3,24}$'),
  constraint coupons_window_valid check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint coupons_percent_range check (discount_type <> 'percent' or value <= 100)
);

create index if not exists idx_coupons_active on coupons (is_active, ends_at);

drop trigger if exists trg_coupons_updated_at on coupons;
create trigger trg_coupons_updated_at
  before update on coupons
  for each row execute function touch_updated_at();

-- One row per coupon redemption, used for global and per-user usage caps.
create table if not exists coupon_redemptions (
  id              uuid primary key default gen_random_uuid(),
  coupon_code     text not null references coupons(code) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  user_id         uuid,
  discount_amount numeric(10, 2) not null check (discount_amount >= 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_coupon_redemptions_coupon on coupon_redemptions (coupon_code);
create index if not exists idx_coupon_redemptions_user on coupon_redemptions (user_id, coupon_code);

-- Keep coupons.used_count denormalised and correct under concurrency.
create or replace function bump_coupon_usage_count()
returns trigger
language plpgsql
as $$
begin
  update coupons set used_count = used_count + 1 where code = new.coupon_code;
  return new;
end;
$$;

drop trigger if exists trg_coupon_redemptions_count on coupon_redemptions;
create trigger trg_coupon_redemptions_count
  after insert on coupon_redemptions
  for each row execute function bump_coupon_usage_count();

-- =====================================================================
-- 8. REVIEWS
-- =====================================================================
create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  user_id      uuid not null,
  order_id     uuid references orders(id) on delete set null,
  rating       integer not null check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reviews_one_per_user unique (menu_item_id, user_id)
);

create index if not exists idx_reviews_menu_item on reviews (menu_item_id);

drop trigger if exists trg_reviews_updated_at on reviews;
create trigger trg_reviews_updated_at
  before update on reviews
  for each row execute function touch_updated_at();

-- Recompute menu_items.rating_avg / rating_count whenever reviews change.
create or replace function refresh_menu_item_rating()
returns trigger
language plpgsql
as $$
declare
  -- NEW is unassigned on DELETE, so pick the right side explicitly.
  target      uuid := case when tg_op = 'DELETE' then old.menu_item_id else new.menu_item_id end;
  avg_rating  numeric(3, 2);
  total_count integer;
begin
  select coalesce(round(avg(r.rating)::numeric, 2), 0), count(*)::integer
    into avg_rating, total_count
    from reviews r
   where r.menu_item_id = target;

  update menu_items m
     set rating_avg = avg_rating,
         rating_count = total_count
   where m.id = target;

  return null;
end;
$$;

drop trigger if exists trg_reviews_refresh_rating on reviews;
create trigger trg_reviews_refresh_rating
  after insert or update or delete on reviews
  for each row execute function refresh_menu_item_rating();

-- =====================================================================
-- 9. ITEM CO-OCCURRENCE  (materialised input for the recommendation engine)
--    Rebuilt on demand by the API. One row per ordered pair of items.
-- =====================================================================
create table if not exists item_cooccurrence (
  item_a       uuid not null references menu_items(id) on delete cascade,
  item_b       uuid not null references menu_items(id) on delete cascade,
  pair_count   integer not null default 0,
  a_count      integer not null default 0,
  b_count      integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (item_a, item_b),
  constraint cooccurrence_distinct check (item_a <> item_b)
);

create or replace function rebuild_item_cooccurrence()
returns integer
language plpgsql
as $$
declare
  v_total integer;
begin
  delete from item_cooccurrence;

  -- pair_count = orders containing BOTH items.
  -- a_count / b_count = orders containing that item at all, which gives us
  -- the denominators for confidence and lift in the recommendation engine.
  insert into item_cooccurrence (item_a, item_b, pair_count, a_count, b_count)
  select x.menu_item_id,
         y.menu_item_id,
         count(*)::integer,
         (select count(distinct p.order_id) from order_items p where p.menu_item_id = x.menu_item_id)::integer,
         (select count(distinct q.order_id) from order_items q where q.menu_item_id = y.menu_item_id)::integer
    from order_items x
    join order_items y
      on y.order_id = x.order_id
     and y.menu_item_id > x.menu_item_id
   group by x.menu_item_id, y.menu_item_id;

  select count(*) into v_total from item_cooccurrence;
  return v_total;
end;
$$;

-- =====================================================================
-- 10. COUPON EVALUATION ENGINE
-- ---------------------------------------------------------------------
-- The single source of truth for coupon rules. Both the "preview discount"
-- call the cart makes while you type a code and the real order placement call
-- go through this function, so the discount you are shown can never differ
-- from the discount you are charged.
--
-- Returns:
--   valid          boolean
--   code           error code when invalid (e.g. COUPON_EXPIRED)
--   message        human readable reason when invalid
--   discount_type  percent | flat | free_delivery
--   discount       rupee amount to take off the subtotal
--   waives_packing true when the coupon removes the packing fee
--   description    coupon description for the UI
-- =====================================================================
create or replace function evaluate_coupon(
  p_code       text,
  p_subtotal   numeric,
  p_user_id    uuid  default null,
  p_categories text[] default '{}',
  p_now        timestamptz default null
)
returns jsonb
language plpgsql
as $$
declare
  v_coupon coupons%rowtype;
  v_code   text := upper(trim(coalesce(p_code, '')));
  v_sub    numeric(10, 2) := coalesce(p_subtotal, 0);
  v_now    timestamptz := coalesce(p_now, now());
  v_discount numeric(10, 2) := 0;
begin
  if v_code = '' then
    return jsonb_build_object('valid', false, 'code', 'COUPON_EMPTY', 'message', 'Enter a coupon code.');
  end if;

  -- Row lock: serialises concurrent redemptions so usage caps cannot overshoot.
  select * into v_coupon from coupons where code = v_code for update;

  if v_coupon.code is null then
    return jsonb_build_object('valid', false, 'code', 'COUPON_INVALID',
                              'message', format('Coupon code "%s" does not exist.', v_code));
  end if;
  if v_coupon.is_active is false then
    return jsonb_build_object('valid', false, 'code', 'COUPON_INACTIVE',
                              'message', format('Coupon "%s" is no longer active.', v_code));
  end if;
  if v_coupon.starts_at is not null and v_now < v_coupon.starts_at then
    return jsonb_build_object('valid', false, 'code', 'COUPON_NOT_STARTED',
                              'message', format('Coupon "%s" is not active yet.', v_code));
  end if;
  if v_coupon.ends_at is not null and v_now > v_coupon.ends_at then
    return jsonb_build_object('valid', false, 'code', 'COUPON_EXPIRED',
                              'message', format('Coupon "%s" has expired.', v_code));
  end if;
  if v_coupon.min_order_amount > 0 and v_sub < v_coupon.min_order_amount then
    return jsonb_build_object('valid', false, 'code', 'COUPON_MIN_ORDER',
                              'message', format('Add Rs %s more to use coupon "%s".',
                                                v_coupon.min_order_amount - v_sub, v_code));
  end if;
  if v_coupon.applies_to_category is not null
     and not exists (select 1 from unnest(coalesce(p_categories, '{}')) c
                      where lower(c) = lower(v_coupon.applies_to_category)) then
    return jsonb_build_object('valid', false, 'code', 'COUPON_CATEGORY',
                              'message', format('Coupon "%s" only applies to the %s category.',
                                                v_code, v_coupon.applies_to_category));
  end if;

  declare used integer;
  begin
    select count(*) into used from coupon_redemptions where coupon_code = v_code;
    if v_coupon.usage_limit is not null and used >= v_coupon.usage_limit then
      return jsonb_build_object('valid', false, 'code', 'COUPON_LIMIT_REACHED',
                                'message', format('Coupon "%s" has reached its usage limit.', v_code));
    end if;
  end;

  if p_user_id is not null and v_coupon.usage_limit_per_user is not null then
    declare user_used integer;
    begin
      select count(*) into user_used
        from coupon_redemptions where coupon_code = v_code and user_id = p_user_id;
      if user_used >= v_coupon.usage_limit_per_user then
        return jsonb_build_object('valid', false, 'code', 'COUPON_USER_LIMIT',
                                  'message', format('You have already used coupon "%s".', v_code));
      end if;
    end;
  end if;

  if v_coupon.discount_type = 'percent' then
    v_discount := round(v_sub * v_coupon.value / 100, 2);
    if v_coupon.max_discount is not null then
      v_discount := least(v_discount, v_coupon.max_discount);
    end if;
  elsif v_coupon.discount_type = 'flat' then
    v_discount := v_coupon.value;
  else
    v_discount := 0;
  end if;

  v_discount := round(least(v_discount, v_sub), 2);

  return jsonb_build_object(
    'valid',          true,
    'code',           v_coupon.code,
    'description',    v_coupon.description,
    'discount_type',  v_coupon.discount_type,
    'discount',       v_discount,
    'waives_packing', v_coupon.discount_type = 'free_delivery',
    'min_order_amount', v_coupon.min_order_amount
  );
end;
$$;

-- =====================================================================
-- 11. ATOMIC ORDER PLACEMENT
-- ---------------------------------------------------------------------
-- Everything below runs inside one Postgres transaction. If any step fails
-- the whole order is rolled back, so you can never end up with an orphaned
-- order that has no line items, or a coupon that was counted as used for an
-- order that does not exist.
-- =====================================================================
create or replace function place_order(
  p_items              jsonb,
  p_coupon_code       text default null,
  p_student_name       text default null,
  p_student_email      text default null,
  p_student_phone      text default null,
  p_user_id            uuid default null,
  p_notes              text default null,
  p_pickup_location    text default null,
  p_packing_fee        numeric default 0,
  p_free_packing_above numeric default 0
)
returns jsonb
language plpgsql
as $$
declare
  v_open        boolean;
  v_message     text;
  v_el          jsonb;
  v_menu_id     uuid;
  v_qty         integer;
  v_name        text;
  v_price       numeric(10, 2);
  v_category    text;
  v_available   boolean;
  v_subtotal    numeric(10, 2) := 0;
  v_discount    numeric(10, 2) := 0;
  v_packing     numeric(10, 2) := coalesce(p_packing_fee, 0);
  v_total       numeric(10, 2) := 0;
  v_items_count integer := 0;
  v_lines       jsonb := '[]'::jsonb;
  v_categories  text[] := '{}';
  v_token       integer;
  v_order       orders%rowtype;
  v_coupon_result jsonb;
  v_now         timestamptz := now();
  v_code        text;
begin
  -- ---- canteen must be open -------------------------------------------
  select is_open, message into v_open, v_message from canteen_state where id = 1;
  if v_open is false then
    raise exception 'CANTEEN_CLOSED:%', coalesce(nullif(v_message, ''), 'The canteen is not accepting orders right now.');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART:Your cart is empty.';
  end if;

  if jsonb_array_length(p_items) > 60 then
    raise exception 'CART_TOO_LARGE:Too many separate items in one order.';
  end if;

  -- ---- price and validate every line against the database -------------
  for v_el in
    select x.menu_item_id, x.quantity
      from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity integer)
  loop
    if v_el.quantity is null or v_el.quantity < 1 or v_el.quantity > 50 then
      raise exception 'INVALID_QUANTITY:Quantity must be between 1 and 50.';
    end if;

    select m.id, m.name, m.price, m.category, m.is_available
      into v_menu_id, v_name, v_price, v_category, v_available
      from menu_items m
     where m.id = v_el.menu_item_id;

    if v_menu_id is null then
      raise exception 'ITEM_NOT_FOUND:One of the items is no longer on the menu.';
    end if;
    if v_available is false then
      raise exception 'ITEM_UNAVAILABLE:% is sold out right now.', v_name;
    end if;

    v_subtotal  := v_subtotal + (v_price * v_el.quantity);
    v_items_count := v_items_count + v_el.quantity;
    v_categories := array_append(v_categories, v_category);
    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', v_menu_id,
      'item_name',    v_name,
      'item_price',   v_price,
      'item_category',v_category,
      'quantity',     v_el.quantity,
      'subtotal',     v_price * v_el.quantity
    );
  end loop;

  v_subtotal := round(v_subtotal, 2);

  -- ---- free packing over the threshold --------------------------------
  if p_free_packing_above > 0 and v_subtotal >= p_free_packing_above then
    v_packing := 0;
  end if;

  -- ---- coupon: delegated to the shared evaluator so the preview shown in
  --      the cart can never disagree with what is actually charged -------
  if p_coupon_code is not null and trim(p_coupon_code) <> '' then
    v_code := upper(trim(p_coupon_code));
    v_coupon_result := evaluate_coupon(
      p_code       => v_code,
      p_subtotal   => v_subtotal,
      p_user_id    => p_user_id,
      p_categories => v_categories
    );

    if not coalesce((v_coupon_result->>'valid')::boolean, false) then
      raise exception '%:%', v_coupon_result->>'code', v_coupon_result->>'message';
    end if;

    v_discount := coalesce((v_coupon_result->>'discount')::numeric, 0);
    if coalesce((v_coupon_result->>'waives_packing')::boolean, false) then
      v_packing := 0;
    end if;
  end if;

  v_packing := round(v_packing, 2);
  v_total   := round(v_subtotal - v_discount + v_packing, 2);

  -- ---- persist ---------------------------------------------------------
  v_token := next_token_number();

  insert into orders (
    token_number, user_id, student_name, student_email, student_phone,
    pickup_location, notes, subtotal_amount, discount_amount, packing_fee,
    total_amount, coupon_code, items_count, status, payment_status
  ) values (
    v_token, p_user_id, p_student_name, p_student_email, p_student_phone,
    p_pickup_location, p_notes, v_subtotal, v_discount, v_packing,
    v_total, v_code, v_items_count, 'pending', 'unpaid'
  )
  returning * into v_order;

  for v_el in select * from jsonb_array_elements(v_lines) loop
    insert into order_items (
      order_id, menu_item_id, item_name, item_price, item_category, quantity, subtotal
    ) values (
      v_order.id,
      (v_el->>'menu_item_id')::uuid,
      v_el->>'item_name',
      (v_el->>'item_price')::numeric,
      v_el->>'item_category',
      (v_el->>'quantity')::integer,
      (v_el->>'subtotal')::numeric
    );
  end loop;

  -- A redemption is recorded for every coupon that was validly applied, even
  -- when the money saved is zero. `free_delivery` has discount 0, and skipping
  -- it would let a student use an unlimited-use code forever without ever
  -- counting against its usage caps.
  if v_code is not null then
    insert into coupon_redemptions (coupon_code, order_id, user_id, discount_amount)
    values (v_code, v_order.id, p_user_id, v_discount);
  end if;

  return to_jsonb(v_order);
end;
$$;

-- =====================================================================
-- 12. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- FoodFlow talks to Postgres exclusively through the API using the
-- service_role key, which bypasses RLS. That means the anon key, which
-- ships inside the browser bundle, must NOT be able to read or write
-- these tables directly. Enabling RLS with zero policies does exactly
-- that: deny everything to anon/authenticated, allow only service_role.
-- =====================================================================
alter table menu_items          enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table order_status_history enable row level security;
alter table token_counter       enable row level security;
alter table canteen_state       enable row level security;
alter table coupons             enable row level security;
alter table coupon_redemptions  enable row level security;
alter table reviews             enable row level security;
alter table item_cooccurrence   enable row level security;

drop policy if exists "deny anon menu_items"        on menu_items;
drop policy if exists "deny anon orders"            on orders;
drop policy if exists "deny anon order_items"       on order_items;
drop policy if exists "deny anon order_status_history" on order_status_history;
drop policy if exists "deny anon token_counter"     on token_counter;
drop policy if exists "deny anon canteen_state"     on canteen_state;
drop policy if exists "deny anon coupons"           on coupons;
drop policy if exists "deny anon coupon_redemptions" on coupon_redemptions;
drop policy if exists "deny anon reviews"           on reviews;
drop policy if exists "deny anon item_cooccurrence" on item_cooccurrence;

-- =====================================================================
-- 13. STARTER COUPONS
--     Delete this whole block if you would rather create coupons from the
--     admin portal. Re-running the schema will not duplicate them.
-- =====================================================================
insert into coupons (code, description, discount_type, value, max_discount, min_order_amount, usage_limit, usage_limit_per_user, applies_to_category)
values
  ('FIRST50',   'Flat Rs 50 off your first canteen order',        'flat',          50,  null, 100, 500, 1,  null),
  ('SAVE10',    '10% off, up to Rs 40',                           'percent',       10,   40,  150, 1000, 3, null),
  ('BIGSPICY',  '15% off on meals',                               'percent',       15,   60,  250, 200, 2,  'meals'),
  ('FREEPACK',  'Free packing on any order',                      'free_delivery',  0,  null,   0, null, null, null)
on conflict (code) do nothing;

-- =====================================================================
-- 14. DONE. Next: run `npm run seed` in the server folder to load menu items.
-- =====================================================================