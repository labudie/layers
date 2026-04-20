-- Ensure admin inserts can pass when policy checks JWT email directly.
-- Keep existing helper check as primary path, but allow canonical admin email fallback.

drop policy if exists "Studio admin insert assets" on public.assets;
create policy "Studio admin insert assets"
  on public.assets
  for insert
  to authenticated
  with check (
    public.is_submissions_admin()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'rjlabudie@gmail.com'
  );
