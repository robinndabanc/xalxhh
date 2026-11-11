-- Existing v3 installations: run this in the Supabase SQL Editor.
-- New installations: the complete supabase-setup.sql already includes this upgrade.
-- Wheel ideas are shared immediately, including suggestions from signed-out viewers.
begin;

alter table public.town_suggestions drop constraint if exists town_suggestion_author;
alter table public.town_suggestions add constraint town_suggestion_author
  check (user_id is not null or kind in ('games','wheel'));

grant insert (wheel_enabled) on public.town_suggestions to anon;
drop policy if exists town_wheel_guest_submit on public.town_suggestions;
create policy town_wheel_guest_submit on public.town_suggestions for insert to anon
  with check (kind = 'wheel' and status = 'approved' and user_id is null
    and wheel_enabled = true and spotify_queued_at is null
    and url is null and description = '' and display_name = '');

drop policy if exists town_suggestions_submit on public.town_suggestions;
create policy town_suggestions_submit on public.town_suggestions for insert to authenticated
  with check (user_id = (select auth.uid()) and (
    (kind = 'games' and status = 'approved' and wheel_enabled = false and spotify_queued_at is null
      and char_length(btrim(display_name)) between 1 and 60)
    or (kind = 'wheel' and status = 'approved' and wheel_enabled = true and spotify_queued_at is null
      and url is null and description = '' and display_name = '')
    or (status = 'pending' and wheel_enabled = false and spotify_queued_at is null)
    or (select public.is_town_staff())
  ));

-- Suggestions must not be silently left off a full wheel.
drop trigger if exists town_limit_wheel on public.town_suggestions;
drop function if exists public.town_limit_wheel();
update public.town_suggestions set status = 'approved', wheel_enabled = true
  where kind = 'wheel' and status = 'pending';
create index if not exists town_shared_wheel_order
  on public.town_suggestions (created_at,id) where status = 'approved' and wheel_enabled = true;

-- Enable live updates on Supabase. The browser also polls as a reconnect fallback.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'town_suggestions') then
    alter publication supabase_realtime add table public.town_suggestions;
  end if;
end;
$$;

commit;
