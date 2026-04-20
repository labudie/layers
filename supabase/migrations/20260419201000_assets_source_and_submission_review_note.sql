alter table public.assets
  add column if not exists source text not null default 'admin'
    check (source in ('admin', 'community')),
  add column if not exists submission_id bigint references public.submissions(id) on delete set null,
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null;

create index if not exists assets_source_idx on public.assets (source);
create index if not exists assets_uploaded_by_idx on public.assets (uploaded_by);
create unique index if not exists assets_submission_id_uniq
  on public.assets (submission_id)
  where submission_id is not null;

alter table public.submissions
  add column if not exists review_note text;
