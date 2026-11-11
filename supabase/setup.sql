-- xalxhh's little town: final illustrated-site schema.
-- Run the WHOLE file in the SQL Editor of a NEW Supabase project.
-- Safe to run again after this version has completed; it preserves submissions and bingo edits.
-- It intentionally refuses older town schemas. Use the matching upgrade files for an older site.
-- It does not create users, assign staff, upload sample entries, or publish a website.
begin;

-- Refuse partial/legacy installations before changing any privileges or policies.
do $$
declare table_name text; found_count integer := 0;
begin
  foreach table_name in array array['town_suggestions','town_settings','town_staff'] loop
    if to_regclass('public.' || table_name) is not null then
      found_count := found_count + 1;
      if obj_description(to_regclass('public.' || table_name), 'pg_class') is distinct from 'xalxhh-town-github-schema-1' then
        raise exception 'Existing town tables were found. This file is for a new project or a rerun of the GitHub schema. Use the older installation''s upgrade instructions instead.';
      end if;
    end if;
  end loop;
  if found_count not in (0,3) then
    raise exception 'The town schema is incomplete. Restore it or use a new Supabase project; this setup will not overwrite a partial installation.';
  end if;
end;
$$;

create table if not exists public.town_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('games','cat-videos','asmr','songs','wheel')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  artist text not null default '' check (char_length(artist) <= 200),
  display_name text not null default '' check (char_length(display_name) <= 60),
  description text not null default '' check (char_length(description) <= 1000),
  url text check (url is null or (char_length(url) <= 2048 and url ~ '^https?://[^[:space:]]+$')),
  status text not null default 'approved' check (status in ('pending','approved','played','rejected')),
  wheel_enabled boolean not null default false,
  metadata_pending boolean not null default false,
  spotify_queued_at timestamptz,
  created_at timestamptz not null default now(),
  constraint town_named_suggestion check (kind = 'wheel' or char_length(btrim(display_name)) between 1 and 60),
  constraint town_required_link check (kind in ('games','wheel') or url is not null),
  constraint town_youtube_link check (kind not in ('cat-videos','asmr') or url ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'),
  constraint town_spotify_link check (kind <> 'songs' or url ~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$'),
  constraint town_wheel_approved_only check (not wheel_enabled or (kind in ('games','wheel') and status = 'approved')),
  constraint town_spotify_songs_only check (spotify_queued_at is null or kind = 'songs')
);

create table if not exists public.town_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','moderator'))
);

create table if not exists public.town_settings (
  key text primary key check (key = 'bingo'),
  value jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

comment on table public.town_suggestions is 'xalxhh-town-github-schema-1';
comment on table public.town_staff is 'xalxhh-town-github-schema-1';
comment on table public.town_settings is 'xalxhh-town-github-schema-1';

create index if not exists town_board_pages on public.town_suggestions (kind,status,created_at desc,id desc);
create index if not exists town_wheel_order on public.town_suggestions (created_at,id)
  where status = 'approved' and wheel_enabled = true;

alter table public.town_suggestions enable row level security;
alter table public.town_staff enable row level security;
alter table public.town_settings enable row level security;

revoke all on public.town_suggestions, public.town_staff, public.town_settings from public,anon,authenticated;
grant usage on schema public to anon,authenticated;
grant select on public.town_suggestions, public.town_settings to anon,authenticated;
grant select (user_id,role) on public.town_staff to authenticated;
grant insert (user_id,kind,title,artist,display_name,description,url,status,wheel_enabled,metadata_pending)
  on public.town_suggestions to anon,authenticated;
grant delete on public.town_suggestions to authenticated;
grant update (wheel_enabled) on public.town_suggestions to authenticated;
grant update (value) on public.town_settings to authenticated;

-- Only the project owner can assign roles, using add-staff.sql or the dashboard.
drop policy if exists town_staff_self on public.town_staff;
create policy town_staff_self on public.town_staff for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_town_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.town_staff where user_id = auth.uid() and role in ('admin','moderator')); $$;
revoke all on function public.is_town_staff() from public;
grant execute on function public.is_town_staff() to anon,authenticated;

drop policy if exists town_suggestions_read on public.town_suggestions;
create policy town_suggestions_read on public.town_suggestions for select to anon,authenticated
  using (status in ('approved','played') or user_id = (select auth.uid()) or (select public.is_town_staff()));

-- Guest and signed-in suggestions appear immediately. Posting never grants moderation rights.
drop policy if exists town_suggestions_submit on public.town_suggestions;
create policy town_suggestions_submit on public.town_suggestions for insert to anon,authenticated
  with check (
    user_id is not distinct from (select auth.uid())
    and status = 'approved' and spotify_queued_at is null
    and (
      (kind = 'wheel' and wheel_enabled = true and url is null
        and description = '' and display_name = '' and artist = '' and metadata_pending = false)
      or (kind in ('games','cat-videos','asmr','songs') and wheel_enabled = false
        and char_length(btrim(display_name)) between 1 and 60
        and (kind <> 'songs' or (char_length(btrim(artist)) between 1 and 200 and metadata_pending = false)))
    )
  );

drop policy if exists town_suggestions_delete_staff on public.town_suggestions;
create policy town_suggestions_delete_staff on public.town_suggestions for delete to authenticated
  using ((select public.is_town_staff()));
drop policy if exists town_suggestions_wheel_staff on public.town_suggestions;
create policy town_suggestions_wheel_staff on public.town_suggestions for update to authenticated
  using ((select public.is_town_staff())) with check ((select public.is_town_staff()));

drop policy if exists town_settings_read on public.town_settings;
create policy town_settings_read on public.town_settings for select to anon,authenticated using (true);
drop policy if exists town_settings_edit on public.town_settings;
create policy town_settings_edit on public.town_settings for update to authenticated
  using ((select public.is_town_staff())) with check ((select public.is_town_staff()));

create or replace function public.town_validate_settings() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.key is distinct from 'bingo' or jsonb_typeof(new.value) is distinct from 'object'
    or jsonb_typeof(new.value->'prompts') is distinct from 'array' then
    raise exception 'Bingo settings must contain an array of prompts.';
  end if;
  if jsonb_array_length(new.value->'prompts') <> 25 or new.value->'prompts'->>12 is distinct from 'FREE 🐾' then
    raise exception 'Bingo needs 24 prompts and the free middle square.';
  end if;
  if exists (select 1 from jsonb_array_elements(new.value->'prompts') as p(element)
    where jsonb_typeof(element) is distinct from 'string' or char_length(btrim(element #>> '{}')) not between 1 and 80) then
    raise exception 'Each bingo prompt must contain 1 to 80 characters.';
  end if;
  if tg_op = 'UPDATE' then new.revision := old.revision + 1; else new.revision := 1; end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.town_validate_settings() from public;
drop trigger if exists town_validate_settings on public.town_settings;
create trigger town_validate_settings before insert or update on public.town_settings
  for each row execute function public.town_validate_settings();

-- Only the first setup creates this card. Reruns preserve the admin's prompts and revision.
insert into public.town_settings (key,value) values
('bingo',jsonb_build_object('prompts',array['Cat cameo','One more game','Mic muted','Snack break','Chat wins','Wrong turn','Big scream','Game crash','Cozy moment','Lost again','Lucky win','Pet the cat','FREE 🐾','Plot twist','Water break','New game','Cat yawn','Bad pun','Jump scare','Clutch win','Zoomies','Chat chaos','Tiny rage','Good advice','Perfect timing']))
on conflict (key) do nothing;

-- Supabase creates this publication. The browser's five-second refresh also handles reconnects.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['town_suggestions','town_settings'] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
        execute format('alter publication supabase_realtime add table public.%I',table_name);
      end if;
    end loop;
  end if;
end;
$$;

commit;
