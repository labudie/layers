-- Track when users download challenge images from the "Your results" screen.
-- Columns required by app: user_id, challenge_id, downloaded_at.

create table if not exists public.image_downloads (
  id bigserial primary key,
  user_id uuid not null,
  challenge_id uuid not null,
  downloaded_at timestamptz not null default now()
);

alter table public.image_downloads enable row level security;

-- Users can only insert rows for themselves.
drop policy if exists "Users insert own image downloads" on public.image_downloads;
create policy "Users insert own image downloads"
  on public.image_downloads
  for insert
  to authenticated
  with check (user_id = auth.uid());

