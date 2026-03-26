-- Speed up daily gameplay page queries.
-- Index suggestions from app perf work:

create index if not exists idx_challenges_active_date
  on public.challenges (active_date);

create index if not exists idx_guesses_user_challenge
  on public.guesses (user_id, challenge_id);

create index if not exists idx_results_user_challenge
  on public.results (user_id, challenge_id);

