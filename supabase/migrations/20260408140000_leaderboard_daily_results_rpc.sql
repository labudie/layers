-- Daily leaderboard: join results + profiles + challenges for a given Eastern calendar day (YYYY-MM-DD).
-- SECURITY DEFINER so the public leaderboard page can read rows even when RLS restricts direct `results` select.

create or replace function public.leaderboard_daily_results(p_active_date text)
returns table (
  user_id uuid,
  challenge_id uuid,
  solved boolean,
  attempts_used integer,
  created_at timestamptz,
  username text,
  avatar_url text,
  challenge_title text,
  challenge_active_date text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.user_id,
    r.challenge_id,
    r.solved,
    r.attempts_used,
    r.created_at,
    p.username,
    p.avatar_url,
    c.title,
    c.active_date::text
  from public.results r
  inner join public.profiles p on p.id = r.user_id
  inner join public.challenges c on c.id = r.challenge_id
  where trim(both from c.active_date::text) = trim(both from p_active_date)
  order by r.attempts_used asc nulls last, r.created_at asc nulls last;
$$;

revoke all on function public.leaderboard_daily_results(text) from public;
grant execute on function public.leaderboard_daily_results(text) to anon;
grant execute on function public.leaderboard_daily_results(text) to authenticated;
