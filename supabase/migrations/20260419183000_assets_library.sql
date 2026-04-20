-- Asset Library CMS: admin-managed challenge assets (draft → ready → scheduled → published).

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  creator_name text,
  software text not null default 'Photoshop',
  category text not null default 'Other',
  layer_count integer not null default 0,
  is_sponsored boolean not null default false,
  sponsor_name text,
  image_url text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'scheduled', 'published')),
  scheduled_date date,
  scheduled_position integer,
  challenge_id uuid references public.challenges (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_scheduled_position_range
    check (scheduled_position is null or (scheduled_position >= 1 and scheduled_position <= 5))
);

create index assets_status_idx on public.assets (status);
create index assets_scheduled_date_idx on public.assets (scheduled_date);
create index assets_challenge_id_idx on public.assets (challenge_id);

create unique index assets_scheduled_slot_uniq
  on public.assets (scheduled_date, scheduled_position)
  where scheduled_date is not null and scheduled_position is not null;

alter table public.assets enable row level security;

drop policy if exists "Studio admin select assets" on public.assets;
create policy "Studio admin select assets"
  on public.assets
  for select
  to authenticated
  using (public.is_submissions_admin());

drop policy if exists "Studio admin insert assets" on public.assets;
create policy "Studio admin insert assets"
  on public.assets
  for insert
  to authenticated
  with check (public.is_submissions_admin());

drop policy if exists "Studio admin update assets" on public.assets;
create policy "Studio admin update assets"
  on public.assets
  for update
  to authenticated
  using (public.is_submissions_admin())
  with check (public.is_submissions_admin());

drop policy if exists "Studio admin delete assets" on public.assets;
create policy "Studio admin delete assets"
  on public.assets
  for delete
  to authenticated
  using (public.is_submissions_admin());

grant select, insert, update, delete on public.assets to authenticated;
