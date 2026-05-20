create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_power bigint default 0,
  legion_1 bigint default 0,
  legion_2 bigint default 0,
  legion_3 bigint default 0,
  legion_4 bigint default 0,
  group_id int default 0 check (group_id between 0 and 4),
  role text default 'Member' check (role in ('Leader', 'Deputy', 'Member')),
  created_at timestamp with time zone default now()
);

alter table public.members enable row level security;

alter table public.members alter column group_id set default 0;
alter table public.members drop constraint if exists members_group_id_check;
alter table public.members add constraint members_group_id_check check (group_id between 0 and 4);

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

do $$
begin
  alter publication supabase_realtime add table public.members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
