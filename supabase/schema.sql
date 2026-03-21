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

alter table public.profiles enable row level security;
alter table public.user_app_state enable row level security;

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
