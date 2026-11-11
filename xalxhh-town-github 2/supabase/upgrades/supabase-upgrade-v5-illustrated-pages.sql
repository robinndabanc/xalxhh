-- Existing v4 projects: run this upgrade before connecting the combined illustrated site.
-- Fresh projects: supabase-setup.sql includes all upgrades through v5.
begin;

alter table public.town_suggestions add column if not exists artist text not null default '';
alter table public.town_suggestions add column if not exists metadata_pending boolean not null default false;
alter table public.town_suggestions drop constraint if exists town_artist_length;
alter table public.town_suggestions add constraint town_artist_length check (char_length(artist) <= 200);
alter table public.town_suggestions drop constraint if exists town_suggestion_author;
alter table public.town_suggestions add constraint town_suggestion_author
  check (user_id is not null or kind in ('games','cat-videos','asmr','songs','wheel'));

grant insert (artist,metadata_pending) on public.town_suggestions to anon,authenticated;
drop policy if exists town_games_guest_submit on public.town_suggestions;
drop policy if exists town_wheel_guest_submit on public.town_suggestions;
drop policy if exists town_public_suggestions_submit on public.town_suggestions;
create policy town_public_suggestions_submit on public.town_suggestions for insert to anon
  with check (user_id is null and status = 'approved' and spotify_queued_at is null and (
    (kind = 'wheel' and wheel_enabled = true and url is null and description = '' and display_name = '' and artist = '' and metadata_pending = false)
    or (kind in ('games','cat-videos','asmr','songs') and wheel_enabled = false and char_length(btrim(display_name)) between 1 and 60
      and (kind <> 'songs' or url ~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$')
      and (kind not in ('cat-videos','asmr') or url ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'))
  ));

drop policy if exists town_suggestions_submit on public.town_suggestions;
create policy town_suggestions_submit on public.town_suggestions for insert to authenticated
  with check (user_id = (select auth.uid()) and (
    (status = 'approved' and spotify_queued_at is null and (
      (kind = 'wheel' and wheel_enabled = true and url is null and description = '' and display_name = '' and artist = '' and metadata_pending = false)
      or (kind in ('games','cat-videos','asmr','songs') and wheel_enabled = false and char_length(btrim(display_name)) between 1 and 60
        and (kind <> 'songs' or url ~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$')
        and (kind not in ('cat-videos','asmr') or url ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'))
    ))
    or (status = 'pending' and wheel_enabled = false and spotify_queued_at is null)
    or (select public.is_town_staff())
  ));

-- Only staff can delete entries. Public posting never grants moderation access.
grant delete on public.town_suggestions to authenticated;
drop policy if exists town_suggestions_delete_staff on public.town_suggestions;
create policy town_suggestions_delete_staff on public.town_suggestions for delete to authenticated
  using ((select public.is_town_staff()));

-- Bingo prompt edits should reach other open viewers as well as suggestion changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'town_settings') then
    alter publication supabase_realtime add table public.town_settings;
  end if;
end;
$$;

commit;
