-- Track whether approved submissions have been scheduled into challenges.
alter table public.submissions
  add column if not exists scheduled_challenge_id uuid references public.challenges(id) on delete set null,
  add column if not exists scheduled_active_date date,
  add column if not exists scheduled_position integer;

create index if not exists idx_submissions_scheduled_challenge_id
  on public.submissions (scheduled_challenge_id);
