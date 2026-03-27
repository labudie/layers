-- Community submissions + admin user visibility support.

-- Optional profile metadata for admin users table.
alter table public.profiles
  add column if not exists email text,
  add column if not exists created_at timestamptz not null default now();

-- User-created challenge submissions.
create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  title text not null,
  creator_name text,
  software text not null,
  category text not null,
  layer_count integer not null,
  image_url text not null,
  is_sponsored boolean not null default false,
  sponsor_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_submissions_user_id on public.submissions (user_id);
create index if not exists idx_submissions_status on public.submissions (status);
create index if not exists idx_submissions_created_at on public.submissions (created_at desc);

alter table public.submissions enable row level security;

drop policy if exists "Users read own submissions" on public.submissions;
create policy "Users read own submissions"
  on public.submissions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own submissions" on public.submissions;
create policy "Users insert own submissions"
  on public.submissions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Admin read all submissions" on public.submissions;
create policy "Admin read all submissions"
  on public.submissions
  for select
  to authenticated
  using ((auth.jwt() ->> 'email') = 'rjlabudie@gmail.com');

drop policy if exists "Admin update all submissions" on public.submissions;
create policy "Admin update all submissions"
  on public.submissions
  for update
  to authenticated
  using ((auth.jwt() ->> 'email') = 'rjlabudie@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'rjlabudie@gmail.com');
