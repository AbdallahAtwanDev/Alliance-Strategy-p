create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_power bigint default 0,
  legion_1 bigint default 0,
  legion_2 bigint default 0,
  legion_3 bigint default 0,
  legion_4 bigint default 0,
  group_id int default 0 check (group_id >= 0),
  role text default 'Member' check (role in ('Leader', 'Deputy', 'Member')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.members enable row level security;

alter table public.members add column if not exists updated_at timestamp with time zone default now();
update public.members set updated_at = coalesce(updated_at, created_at, now());

alter table public.members alter column group_id set default 0;
alter table public.members drop constraint if exists members_group_id_check;
alter table public.members add constraint members_group_id_check check (group_id >= 0);

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  mode text not null check (mode in ('admin', 'viewer')),
  created_at timestamp with time zone default now()
);

alter table public.login_events enable row level security;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "Allow anon read members" on public.members;
create policy "Allow anon read members"
  on public.members for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow anon insert members" on public.members;
create policy "Allow anon insert members"
  on public.members for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Allow anon update members" on public.members;
create policy "Allow anon update members"
  on public.members for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Allow anon delete members" on public.members;
create policy "Allow anon delete members"
  on public.members for delete
  to anon, authenticated
  using (true);

create index if not exists members_group_id_idx on public.members (group_id);
create index if not exists members_total_power_idx on public.members (total_power desc);
create index if not exists login_events_created_at_idx on public.login_events (created_at desc);

drop policy if exists "Allow anon read app settings" on public.app_settings;
create policy "Allow anon read app settings"
  on public.app_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow anon write app settings" on public.app_settings;
create policy "Allow anon write app settings"
  on public.app_settings for all
  to anon, authenticated
  using (true)
  with check (true);

insert into public.app_settings (key, value)
values ('dashboard_config', '{"group_count":4,"power_ranges":{"1":{"min":"0","max":"50M"},"2":{"min":"50M","max":"100M"},"3":{"min":"100M","max":"200M"},"4":{"min":"200M","max":"999B"}}}'::jsonb)
on conflict (key) do nothing;

drop policy if exists "Allow anon read login events" on public.login_events;
create policy "Allow anon read login events"
  on public.login_events for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow anon insert login events" on public.login_events;
create policy "Allow anon insert login events"
  on public.login_events for insert
  to anon, authenticated
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.login_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.app_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
