-- Existing installations: run this once after the original setup.
-- New installations: supabase-setup.sql already includes this upgrade.
begin;

create table if not exists public.town_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','moderator'))
);
alter table public.town_staff enable row level security;
revoke all on public.town_staff from public,anon,authenticated;
grant select (user_id,role) on public.town_staff to authenticated;
drop policy if exists town_staff_self on public.town_staff;
create policy town_staff_self on public.town_staff for select to authenticated using (user_id = (select auth.uid()));

-- Role membership is looked up on the server. Visitors cannot assign their own roles.
create or replace function public.is_town_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.town_staff where user_id = auth.uid() and role in ('admin','moderator')); $$;
revoke all on function public.is_town_staff() from public;
grant execute on function public.is_town_staff() to anon,authenticated;

alter table public.town_suggestions add column if not exists wheel_enabled boolean not null default false;
alter table public.town_suggestions add column if not exists spotify_queued_at timestamptz;
alter table public.town_suggestions drop constraint if exists town_suggestions_kind_check;
alter table public.town_suggestions add constraint town_suggestions_kind_check check (kind in ('games','wheel','cat-videos','asmr','songs','clips'));
alter table public.town_suggestions drop constraint if exists town_suggestions_status_check;
alter table public.town_suggestions add constraint town_suggestions_status_check check (status in ('pending','approved','played','rejected'));
alter table public.town_suggestions drop constraint if exists town_suggestions_check;
alter table public.town_suggestions add constraint town_suggestions_check check (kind in ('games','wheel') or url is not null);
alter table public.town_suggestions drop constraint if exists town_wheel_approved_only;
alter table public.town_suggestions add constraint town_wheel_approved_only check (not wheel_enabled or (kind in ('games','wheel') and status = 'approved'));
alter table public.town_suggestions drop constraint if exists town_spotify_songs_only;
alter table public.town_suggestions add constraint town_spotify_songs_only check (spotify_queued_at is null or kind = 'songs');
alter table public.town_cats drop constraint if exists town_cats_status_check;
alter table public.town_cats add constraint town_cats_status_check check (status in ('pending','approved','rejected'));

drop policy if exists town_suggestions_read on public.town_suggestions;
create policy town_suggestions_read on public.town_suggestions for select to anon,authenticated
  using (status in ('approved','played') or user_id = (select auth.uid()) or (select public.is_town_staff()));
drop policy if exists town_suggestions_submit on public.town_suggestions;
create policy town_suggestions_submit on public.town_suggestions for insert to authenticated
  with check (user_id = (select auth.uid()) and (
    (status = 'pending' and wheel_enabled = false and spotify_queued_at is null)
    or (select public.is_town_staff())
  ));
drop policy if exists town_suggestions_moderate on public.town_suggestions;
create policy town_suggestions_moderate on public.town_suggestions for update to authenticated
  using ((select public.is_town_staff())) with check ((select public.is_town_staff()));
grant insert (wheel_enabled) on public.town_suggestions to authenticated;
grant update (status,wheel_enabled,spotify_queued_at) on public.town_suggestions to authenticated;

drop policy if exists town_cats_read on public.town_cats;
create policy town_cats_read on public.town_cats for select to anon,authenticated
  using (status = 'approved' or user_id = (select auth.uid()) or (select public.is_town_staff()));
drop policy if exists town_cats_moderate on public.town_cats;
create policy town_cats_moderate on public.town_cats for update to authenticated
  using ((select public.is_town_staff())) with check ((select public.is_town_staff()));
grant update (status) on public.town_cats to authenticated;

drop policy if exists town_cats_file_read on storage.objects;
create policy town_cats_file_read on storage.objects for select to anon,authenticated
  using (bucket_id = 'town-cats' and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_town_staff())
    or exists (select 1 from public.town_cats c where c.object_path = name and c.status = 'approved')
  ));

-- Keep all enabled wheel options visible and readable. Serialise changes across moderators.
create or replace function public.town_limit_wheel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.wheel_enabled and (tg_op = 'INSERT' or not old.wheel_enabled) then
    perform pg_advisory_xact_lock(180019, 24);
    if (select count(*) from public.town_suggestions where wheel_enabled and id <> new.id) >= 24 then
      raise exception 'The wheel can hold 24 active options. Remove one before adding another.';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.town_limit_wheel() from public;
drop trigger if exists town_limit_wheel on public.town_suggestions;
create trigger town_limit_wheel before insert or update on public.town_suggestions for each row execute function public.town_limit_wheel();

create table if not exists public.town_settings (
  key text primary key check (key in ('bingo','music')),
  value jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.town_settings enable row level security;
revoke all on public.town_settings from public,anon,authenticated;
grant select on public.town_settings to anon,authenticated;
grant update (value) on public.town_settings to authenticated;
drop policy if exists town_settings_read on public.town_settings;
create policy town_settings_read on public.town_settings for select to anon,authenticated using (true);
drop policy if exists town_settings_edit on public.town_settings;
create policy town_settings_edit on public.town_settings for update to authenticated
  using ((select public.is_town_staff())) with check ((select public.is_town_staff()));

create or replace function public.town_validate_settings() returns trigger
language plpgsql set search_path = '' as $$
declare link text;
begin
  if jsonb_typeof(new.value) is distinct from 'object' then raise exception 'Settings must be an object.'; end if;
  if new.key = 'bingo' then
    if jsonb_typeof(new.value->'prompts') is distinct from 'array' then raise exception 'Bingo needs an array of prompts.'; end if;
    if jsonb_array_length(new.value->'prompts') <> 25 or new.value->'prompts'->>12 is distinct from 'FREE 🐾' then
      raise exception 'Bingo needs 24 prompts and the free middle square.';
    end if;
    if exists (select 1 from jsonb_array_elements(new.value->'prompts') as p(element)
      where jsonb_typeof(element) is distinct from 'string' or char_length(btrim(element #>> '{}')) not between 1 and 80) then
      raise exception 'Each bingo prompt must contain 1 to 80 characters.';
    end if;
  elsif new.key = 'music' then
    if jsonb_typeof(new.value->'spotify_embed_url') is distinct from 'string' then raise exception 'Supply a Spotify link or an empty string.'; end if;
    link := new.value->>'spotify_embed_url';
    if link <> '' and (char_length(link) > 2048 or link !~ '^https://open[.]spotify[.]com/(intl-[a-z-]+/)?(embed/)?(playlist|album|track|artist)/[A-Za-z0-9]{22}/?([?][^[:space:]]*)?$') then
      raise exception 'Use a full Spotify playlist, album, artist or track link.';
    end if;
  end if;
  if tg_op = 'UPDATE' then new.revision := old.revision + 1; else new.revision := 1; end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.town_validate_settings() from public;
drop trigger if exists town_validate_settings on public.town_settings;
create trigger town_validate_settings before insert or update on public.town_settings for each row execute function public.town_validate_settings();

insert into public.town_settings (key,value) values
('bingo',jsonb_build_object('prompts',array['Cat cameo','One more game','Mic muted','Snack break','Chat wins','Wrong turn','Big scream','Game crash','Cozy moment','Lost again','Lucky win','Pet the cat','FREE 🐾','Plot twist','Water break','New game','Cat yawn','Bad pun','Jump scare','Clutch win','Zoomies','Chat chaos','Tiny rage','Good advice','Perfect timing'])),
('music','{"spotify_embed_url":""}'::jsonb)
on conflict (key) do nothing;

commit;

-- Only the Supabase project owner assigns staff, after each person signs in once:
-- insert into public.town_staff (user_id,role)
-- select id,'admin' from auth.users where lower(email)=lower('REPLACE_WITH_STREAMER_EMAIL')
-- on conflict (user_id) do update set role=excluded.role;
-- Use 'moderator' for moderators. There is no browser-accessible role-assignment endpoint.
