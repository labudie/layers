-- Challenges: public read for the daily game; studio admin can publish/edit/delete.
-- Server actions use createSupabaseServerClient(cookies) as the authenticated user;
-- RLS must allow that user to INSERT when is_submissions_admin() is true.

alter table public.challenges enable row level security;

drop policy if exists "Anyone can read challenges" on public.challenges;
create policy "Anyone can read challenges"
  on public.challenges
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Studio admin insert challenges" on public.challenges;
create policy "Studio admin insert challenges"
  on public.challenges
  for insert
  to authenticated
  with check (public.is_submissions_admin());

drop policy if exists "Studio admin update challenges" on public.challenges;
create policy "Studio admin update challenges"
  on public.challenges
  for update
  to authenticated
  using (public.is_submissions_admin())
  with check (public.is_submissions_admin());

drop policy if exists "Studio admin delete challenges" on public.challenges;
create policy "Studio admin delete challenges"
  on public.challenges
  for delete
  to authenticated
  using (public.is_submissions_admin());
