create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  role text not null default 'customer' check (role in ('customer', 'business')),
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive', 'active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_plan text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  claims jsonb not null default '[]'::jsonb,
  catalog_coupons jsonb not null default '[]'::jsonb,
  notifications jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deals (
  id text primary key,
  owner_id uuid references auth.users (id) on delete set null,
  business_type text not null default 'local' check (business_type in ('local', 'online')),
  status text not null default 'active' check (status in ('active', 'expired', 'draft')),
  featured boolean not null default false,
  admin_tag text check (admin_tag in ('featured', 'trending')),
  business_name text not null,
  logo_url text,
  image_url text,
  title text not null,
  description text not null,
  offer_text text not null,
  original_price double precision,
  discount_percent double precision,
  affiliate_url text,
  review_count integer,
  stock_status text,
  website_url text,
  product_url text,
  has_timer boolean not null default true,
  distance text not null default 'Online',
  lat double precision not null default 0,
  lng double precision not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  max_claims integer not null default 0,
  current_claims integer not null default 0,
  claim_count integer not null default 0,
  category text not null
);

alter table public.deals add column if not exists featured boolean not null default false;
alter table public.deals add column if not exists admin_tag text;
alter table public.deals add column if not exists original_price double precision;
alter table public.deals add column if not exists discount_percent double precision;
alter table public.deals add column if not exists affiliate_url text;
alter table public.deals add column if not exists review_count integer;
alter table public.deals add column if not exists stock_status text;
alter table public.deals add column if not exists business_type text not null default 'local';
alter table public.deals add column if not exists status text not null default 'active';
alter table public.deals add column if not exists business_name text;
alter table public.deals add column if not exists logo_url text;
alter table public.deals add column if not exists image_url text;
alter table public.deals add column if not exists offer_text text;
alter table public.deals add column if not exists website_url text;
alter table public.deals add column if not exists product_url text;
alter table public.deals add column if not exists has_timer boolean not null default true;
alter table public.deals add column if not exists distance text not null default 'Online';
alter table public.deals add column if not exists lat double precision not null default 0;
alter table public.deals add column if not exists lng double precision not null default 0;
alter table public.deals add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.deals add column if not exists expires_at timestamptz;
alter table public.deals add column if not exists max_claims integer not null default 0;
alter table public.deals add column if not exists current_claims integer not null default 0;
alter table public.deals add column if not exists claim_count integer not null default 0;
alter table public.deals add column if not exists category text;

alter table public.profiles enable row level security;
alter table public.user_app_state enable row level security;
alter table public.deals enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.deals to anon, authenticated;
grant insert on public.deals to anon, authenticated;
grant update on public.deals to authenticated;
grant delete on public.deals to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "user_app_state_select_own" on public.user_app_state;
create policy "user_app_state_select_own"
on public.user_app_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_app_state_insert_own" on public.user_app_state;
create policy "user_app_state_insert_own"
on public.user_app_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_app_state_update_own" on public.user_app_state;
create policy "user_app_state_update_own"
on public.user_app_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "deals_select_all" on public.deals;
create policy "deals_select_public_active"
on public.deals
for select
to anon
using (status = 'active');

drop policy if exists "deals_select_authenticated_all" on public.deals;
create policy "deals_select_authenticated_all"
on public.deals
for select
to authenticated
using (true);

drop policy if exists "deals_insert_authenticated" on public.deals;
create policy "deals_insert_authenticated"
on public.deals
for insert
to anon, authenticated
with check (true);

drop policy if exists "deals_update_owner" on public.deals;
create policy "deals_update_owner"
on public.deals
for update
to authenticated
using (auth.uid() = owner_id or owner_id is null)
with check (auth.uid() = owner_id or owner_id is null);

drop policy if exists "deals_delete_owner" on public.deals;
create policy "deals_delete_owner"
on public.deals
for delete
to authenticated
using (auth.uid() = owner_id or owner_id is null);
