-- Admin RLS: auth.jwt() ->> 'email' is often null (OAuth / metadata layout).
-- Use canonical auth.users.email via a stable SECURITY DEFINER helper.

create or replace function public.is_submissions_admin()
returns boolean
language sql
stable
security definer
set search_path = auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(coalesce(u.email, '')) = lower('rjlabudie@gmail.com')
  );
$$;

revoke all on function public.is_submissions_admin() from public;
grant execute on function public.is_submissions_admin() to authenticated;

drop policy if exists "Admin read all submissions" on public.submissions;
create policy "Admin read all submissions"
  on public.submissions
  for select
  to authenticated
  using (public.is_submissions_admin());

drop policy if exists "Admin update all submissions" on public.submissions;
create policy "Admin update all submissions"
  on public.submissions
  for update
  to authenticated
  using (public.is_submissions_admin())
  with check (public.is_submissions_admin());
