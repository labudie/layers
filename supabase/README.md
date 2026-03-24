# Supabase (local reference)

## Apply migrations

If you use the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link   # once, to your project
supabase db push
```

Or open the **SQL Editor** in the Supabase Dashboard, paste the contents of `migrations/20260323120000_avatars_and_profile_avatar.sql`, and run it.

## What the migration does

1. **`profiles.avatar_url`** — nullable `text` column for the public image URL after upload.
2. **`avatars` storage bucket** — public bucket, ~5MB limit, image MIME types only.
3. **`storage.objects` policies**
   - **SELECT**: anyone can read `avatars` (needed for public URLs in `<img>`).
   - **INSERT / UPDATE / DELETE**: only **authenticated** users, and only objects whose path is `{auth.uid()}/...` (matches `app/settings/page.tsx` uploads).

## If `storage.foldername` errors

On some Postgres versions the `storage` schema helpers differ. Replace the folder check with:

```sql
split_part(name, '/', 1) = auth.uid()::text
```

in each policy’s `WITH CHECK` / `USING` clause.

## Row Level Security (`profiles`)

Ensure your existing `profiles` RLS allows users to `UPDATE` their own row (including `avatar_url`). The app uses the browser Supabase client with the user’s JWT.
