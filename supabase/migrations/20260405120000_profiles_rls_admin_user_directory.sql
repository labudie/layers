-- Profiles: explicit RLS so users can manage their row; leaderboard-style reads stay allowed.
-- Admin Users tab: RPC joins auth.users for canonical email + signup time (PostgREST cannot join auth).

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

-- Admin-only listing: profiles.* semantics + auth email + joined_at from auth.users
create or replace function public.admin_list_user_profiles(
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  email text,
  joined_at timestamptz,
  total_solved integer,
  current_streak integer,
  last_played_date date
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id,
    p.username,
    u.email::text,
    u.created_at as joined_at,
    p.total_solved,
    p.current_streak,
    p.last_played_date
  from public.profiles p
  inner join auth.users u on u.id = p.id
  where public.is_submissions_admin()
  order by u.created_at desc
  limit coalesce(nullif(p_limit, 0), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_list_user_profiles(integer, integer) from public;
grant execute on function public.admin_list_user_profiles(integer, integer) to authenticated;
