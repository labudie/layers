-- Leaderboard + badges + creator metrics support.

-- Profile progression/stats fields.
alter table public.profiles
  add column if not exists current_streak integer not null default 0,
  add column if not exists longest_streak integer not null default 0,
  add column if not exists total_solved integer not null default 0,
  add column if not exists perfect_days integer not null default 0,
  add column if not exists last_played_date date,
  add column if not exists badges text[] not null default '{}';

-- Creator name for each challenge (for creators tab / creator badges).
alter table public.challenges
  add column if not exists creator_name text;

-- Track challenge image downloads.
create table if not exists public.image_downloads (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);

alter table public.image_downloads enable row level security;

drop policy if exists "Users insert own image downloads" on public.image_downloads;
create policy "Users insert own image downloads"
  on public.image_downloads
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users read own image downloads" on public.image_downloads;
create policy "Users read own image downloads"
  on public.image_downloads
  for select
  to authenticated
  using (user_id = auth.uid());

-- Helpful indexes for leaderboard metrics queries.
create index if not exists idx_image_downloads_challenge_id
  on public.image_downloads (challenge_id);
create index if not exists idx_image_downloads_user_id
  on public.image_downloads (user_id);

-- Creator leaderboard rollup.
create or replace view public.creator_leaderboard as
with submissions as (
  select
    c.creator_name,
    count(*)::bigint as total_submissions
  from public.challenges c
  where c.creator_name is not null and btrim(c.creator_name) <> ''
  group by c.creator_name
),
downloads as (
  select
    c.creator_name,
    count(d.id)::bigint as total_downloads,
    count(distinct d.user_id)::bigint as total_players
  from public.challenges c
  left join public.image_downloads d on d.challenge_id = c.id
  where c.creator_name is not null and btrim(c.creator_name) <> ''
  group by c.creator_name
)
select
  s.creator_name,
  s.total_submissions,
  coalesce(d.total_downloads, 0)::bigint as total_downloads,
  coalesce(d.total_players, 0)::bigint as total_players
from submissions s
left join downloads d on d.creator_name = s.creator_name;
