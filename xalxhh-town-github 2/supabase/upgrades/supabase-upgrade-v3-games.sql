-- Existing v2 installations: run this in the Supabase SQL Editor.
-- New installations: the complete supabase-setup.sql includes v2 and v3.
-- Game notes now appear immediately and accept a public display name without requiring email sign-in.
begin;

alter table public.town_suggestions add column if not exists display_name text not null default '';
alter table public.town_suggestions drop constraint if exists town_display_name_length;
alter table public.town_suggestions add constraint town_display_name_length check (char_length(display_name) <= 60);
alter table public.town_suggestions alter column user_id drop not null;
alter table public.town_suggestions drop constraint if exists town_suggestion_author;
alter table public.town_suggestions add constraint town_suggestion_author check (user_id is not null or kind = 'games');
create index if not exists town_game_board_pages on public.town_suggestions (kind,status,created_at desc,id desc);

-- A signed-out visitor may only create a visible GAME note, with a name and no privileged flags.
grant insert (user_id,kind,title,description,url,status,display_name) on public.town_suggestions to anon;
grant insert (display_name) on public.town_suggestions to authenticated;
drop policy if exists town_games_guest_submit on public.town_suggestions;
create policy town_games_guest_submit on public.town_suggestions for insert to anon
  with check (kind = 'games' and status = 'approved' and user_id is null
    and wheel_enabled = false and spotify_queued_at is null
    and char_length(btrim(display_name)) between 1 and 60);

-- Signed-in viewers can use the same game form. Other suggestion types keep their pending-review flow.
drop policy if exists town_suggestions_submit on public.town_suggestions;
create policy town_suggestions_submit on public.town_suggestions for insert to authenticated
  with check (user_id = (select auth.uid()) and (
    (kind = 'games' and status = 'approved' and wheel_enabled = false and spotify_queued_at is null
      and char_length(btrim(display_name)) between 1 and 60)
    or (status = 'pending' and wheel_enabled = false and spotify_queued_at is null)
    or (select public.is_town_staff())
  ));

-- Moderation rights still come only from the existing staff policy.
-- Guests cannot edit/delete notes, assign roles, add wheel options, or post other submission kinds.
commit;
