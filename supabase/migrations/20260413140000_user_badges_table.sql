-- Per-user badge grants (source for first-time unlock notifications + audit).
-- Profiles.badges remains the denormalized array for reads across the app.

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists idx_user_badges_user_id on public.user_badges (user_id);

alter table public.user_badges enable row level security;

drop policy if exists "Users read own user_badges" on public.user_badges;
create policy "Users read own user_badges"
  on public.user_badges
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own user_badges" on public.user_badges;
create policy "Users insert own user_badges"
  on public.user_badges
  for insert
  to authenticated
  with check (user_id = auth.uid());
