-- Public creator profiles: read approved submissions for portfolios + download counts RPC.

drop policy if exists "Public read approved submissions" on public.submissions;
create policy "Public read approved submissions"
  on public.submissions
  for select
  to anon, authenticated
  using (status = 'approved');

create or replace function public.get_download_counts_for_challenges(p_challenge_ids uuid[])
returns table (challenge_id uuid, download_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select d.challenge_id, count(*)::bigint as download_count
  from public.image_downloads d
  where p_challenge_ids is not null
    and array_length(p_challenge_ids, 1) is not null
    and d.challenge_id = any(p_challenge_ids)
  group by d.challenge_id;
$$;

revoke all on function public.get_download_counts_for_challenges(uuid[]) from public;
grant execute on function public.get_download_counts_for_challenges(uuid[]) to anon;
grant execute on function public.get_download_counts_for_challenges(uuid[]) to authenticated;
