-- Link published challenges to a profile when creator_name matches @username / username.

alter table public.challenges
  add column if not exists creator_user_id uuid references public.profiles (id) on delete set null;

create index if not exists idx_challenges_creator_user_id_null_lookup
  on public.challenges (creator_name)
  where creator_user_id is null;

drop policy if exists "Users claim creator challenges by username" on public.challenges;
create policy "Users claim creator challenges by username"
  on public.challenges
  for update
  to authenticated
  using (
    creator_user_id is null
    and (
      lower(trim(both from creator_name))
        = lower(trim(both from (select p.username from public.profiles p where p.id = auth.uid())))
      or lower(trim(both from creator_name))
        = lower('@' || trim(both from (select p.username from public.profiles p where p.id = auth.uid())))
    )
  )
  with check (
    creator_user_id = auth.uid()
    and (
      lower(trim(both from creator_name))
        = lower(trim(both from (select p.username from public.profiles p where p.id = auth.uid())))
      or lower(trim(both from creator_name))
        = lower('@' || trim(both from (select p.username from public.profiles p where p.id = auth.uid())))
    )
  );
