-- SECTION 1: guesses + results tables (if missing) and RLS aligned with app expectations.
-- SECTION 3: max 3 guesses per (user_id, challenge_id) enforced with INSERT policy + trigger fallback.

create table if not exists public.guesses (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  guess integer not null,
  attempt_number integer not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_guesses_user_challenge on public.guesses (user_id, challenge_id);

create table if not exists public.results (
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  solved boolean not null default false,
  attempts_used integer not null default 0,
  position integer,
  created_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

alter table public.guesses enable row level security;
alter table public.results enable row level security;

drop policy if exists "Users read own guesses" on public.guesses;
create policy "Users read own guesses"
  on public.guesses
  for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT: own rows only. Max 3 per (user_id, challenge_id) is enforced by trigger below
-- (PostgreSQL RLS INSERT policies cannot reliably self-reference the target table for counts).
drop policy if exists "Users insert own guesses max three per challenge" on public.guesses;
drop policy if exists "Users insert own guesses" on public.guesses;
create policy "Users insert own guesses"
  on public.guesses
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Reliable server-side cap even if policies change (fires before row is visible).
create or replace function public.enforce_max_three_guesses_per_challenge()
returns TRIGGER
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)::integer
    from public.guesses g
    where g.user_id = NEW.user_id
      and g.challenge_id = NEW.challenge_id
  ) >= 3 then
    raise exception 'Maximum of 3 guesses per challenge reached';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guesses_max_three on public.guesses;
create trigger trg_guesses_max_three
  before insert on public.guesses
  for each row
  execute procedure public.enforce_max_three_guesses_per_challenge();

drop policy if exists "Public read results leaderboard" on public.results;
create policy "Public read results leaderboard"
  on public.results
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users insert own results" on public.results;
create policy "Users insert own results"
  on public.results
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own results" on public.results;
create policy "Users update own results"
  on public.results
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Submissions: drop broad public SELECT on approved rows; expose portfolio via SECURITY DEFINER RPC.
drop policy if exists "Public read approved submissions" on public.submissions;

create or replace function public.get_public_profile_approved_submissions(p_profile_user_id uuid)
returns table (
  id bigint,
  title text,
  software text,
  image_url text,
  scheduled_challenge_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.title,
    s.software,
    s.image_url,
    s.scheduled_challenge_id
  from public.submissions s
  where s.user_id = p_profile_user_id
    and s.status = 'approved'
  order by s.created_at desc;
$$;

revoke all on function public.get_public_profile_approved_submissions(uuid) from public;
grant execute on function public.get_public_profile_approved_submissions(uuid) to anon;
grant execute on function public.get_public_profile_approved_submissions(uuid) to authenticated;

drop policy if exists "Admin delete submissions" on public.submissions;
create policy "Admin delete submissions"
  on public.submissions
  for delete
  to authenticated
  using (public.is_submissions_admin());

-- user_badges ("badges" grants table): public read as specified.
drop policy if exists "Users read own user_badges" on public.user_badges;
drop policy if exists "Public read user_badges" on public.user_badges;

create policy "Public read user_badges"
  on public.user_badges
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users insert own user_badges" on public.user_badges;
create policy "Users insert own user_badges"
  on public.user_badges
  for insert
  to authenticated
  with check (user_id = auth.uid());
