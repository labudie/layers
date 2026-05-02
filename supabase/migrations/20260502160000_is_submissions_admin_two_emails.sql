-- Align DB admin helper with app ADMIN_EMAILS (studio RLS).

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
      and lower(coalesce(u.email, '')) in (
        lower('rjlabudie@gmail.com'),
        lower('info@layersgame.com')
      )
  );
$$;

drop policy if exists "Studio admin insert assets" on public.assets;
create policy "Studio admin insert assets"
  on public.assets
  for insert
  to authenticated
  with check (
    public.is_submissions_admin()
    or lower(coalesce(auth.jwt() ->> 'email', '')) in (
      'rjlabudie@gmail.com',
      'info@layersgame.com'
    )
  );
