-- Profiles: explicit RLS so users can manage their row; leaderboard-style reads stay allowed.
-- Admin Users tab reads profiles directly from the app (no auth.users join).

alter table public.profiles enable row level security;

drop policy if exists "Public read profiles" on public.profiles;
create policy "Public read profiles"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
