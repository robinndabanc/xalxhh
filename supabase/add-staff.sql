-- After this person has signed in once, run this file in the Supabase SQL Editor.
-- Edit the TWO values below. Run once per streamer/moderator.
-- This template contains no password and grants no access until a real email is supplied.
begin;
do $$
declare
  staff_email text := 'REPLACE_WITH_STAFF_EMAIL';
  staff_role text := 'admin'; -- Use 'moderator' for a moderator.
  account_id uuid;
begin
  if staff_email = 'REPLACE_WITH_STAFF_EMAIL' or btrim(staff_email) = '' or position('@' in staff_email) < 2 then
    raise exception 'Replace REPLACE_WITH_STAFF_EMAIL with the staff member''s actual sign-in email before running this file.';
  end if;
  if staff_role not in ('admin','moderator') then
    raise exception 'staff_role must be admin or moderator.';
  end if;
  select id into account_id from auth.users where lower(email) = lower(btrim(staff_email));
  if account_id is null then
    raise exception 'No account exists for %. Have that person sign in through the website''s Admin page once, then run this file again.',staff_email;
  end if;
  insert into public.town_staff (user_id,role) values (account_id,staff_role)
  on conflict (user_id) do update set role = excluded.role;
  raise notice 'Staff access assigned to % with role %. Refresh the website.',staff_email,staff_role;
end;
$$;
commit;
