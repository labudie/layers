-- Allow OAuth users to complete username on /onboarding before username is set.
alter table public.profiles alter column username drop not null;
