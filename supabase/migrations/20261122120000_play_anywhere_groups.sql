-- =====================================================================
-- Play from anywhere.
--  * No venue check-in: a player joins a live, published match from any place.
--    Venue tables and data stay in place (hidden), for a later venue-code idea.
--  * Every right answer is worth exactly 10 points. No 2x, no streak bonus.
--  * Coupons are switched off: resolving a question no longer issues any.
--  * Private groups: a player makes a group, shares its code, and friends join.
--    Leaderboards: per match and per series, for everyone or for one group.
--  * Age gate 18+, no location consent.
-- =====================================================================

-- 1. Sessions without a venue ------------------------------------------
alter table public.player_sessions
  alter column venue_id drop not null,
  alter column verification_method drop not null;

alter table public.users alter column location_consent_at drop not null;
comment on column public.users.age_verified_21 is 'Player confirmed the minimum age at sign-up (18+ since Nov 2026; 21+ before).';

-- 2. Join a match (creates the session, no check-in) ---------------------
create function public.join_match(p_match_id uuid)
returns table(points_total integer, correct integer, answered integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.player_sessions;
begin
  perform private.require_player();
  if not exists (select 1 from public.matches where id = p_match_id and status = 'live' and published_at is not null) then
    raise exception 'match_not_live';
  end if;
  insert into public.player_sessions as x (user_id, match_id)
  values (auth.uid(), p_match_id)
  on conflict (user_id, match_id) do update set last_seen_at = now(), needs_reverify = false
  returning * into s;
  return query
    select s.points_total,
           (select count(*)::int from public.answers a where a.session_id = s.id and a.is_correct),
           (select count(*)::int from public.answers a where a.session_id = s.id);
end $$;

-- 3. Answer: session made on the fly, one answer per question ------------
create or replace function public.submit_prediction(p_question_id uuid, p_option smallint, p_double boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q public.questions;
  sid uuid;
  aid uuid;
begin
  perform private.require_player();
  select * into q from public.questions where id = p_question_id;
  if not found or q.status <> 'live' or now() >= q.locks_at then raise exception 'question_closed'; end if;
  if p_option is null or p_option < 0 or p_option >= array_length(q.options, 1) then
    raise exception 'invalid_option';
  end if;

  insert into public.player_sessions as x (user_id, match_id)
  values (auth.uid(), q.match_id)
  on conflict (user_id, match_id) do update set last_seen_at = now()
  returning x.id into sid;

  insert into public.answers (question_id, session_id, user_id, selected_option, is_double)
  values (q.id, sid, auth.uid(), p_option, false)
  on conflict (question_id, user_id) do nothing
  returning id into aid;
  if aid is null then raise exception 'already_answered'; end if;
  return aid;
end $$;

-- 4. Resolve: 10 points per right answer, nothing else -------------------
create or replace function public.resolve_question(p_question_id uuid, p_correct_option smallint)
returns table(correct_count integer, coupons_issued integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q public.questions;
  n_correct int := 0;
begin
  perform private.require_role('{admin,game_master}');
  select * into q from public.questions where id = p_question_id for update;
  if not found or q.status not in ('live', 'locked') then raise exception 'cannot_resolve'; end if;
  if p_correct_option < 0 or p_correct_option >= array_length(q.options, 1) then raise exception 'invalid_option'; end if;

  update public.questions
     set status = 'resolved', correct_option = p_correct_option,
         locks_at = least(locks_at, now()), resolved_at = now()
   where id = q.id;

  update public.answers a
     set is_correct = (a.selected_option = p_correct_option),
         bonus_points = 0,
         points_awarded = case when a.selected_option = p_correct_option then 10 else 0 end
   where a.question_id = q.id;

  update public.player_sessions s
     set points_total = s.points_total + a.points_awarded,
         streak = case when a.is_correct then s.streak + 1 else 0 end,
         best_streak = greatest(s.best_streak, case when a.is_correct then s.streak + 1 else 0 end)
    from public.answers a
   where a.question_id = q.id and a.session_id = s.id;

  select count(*) into n_correct from public.answers where question_id = q.id and is_correct;
  return query select n_correct, 0;
end $$;

-- New questions and pack templates are 10 points.
update public.questions set points = 10 where status = 'draft' and points <> 10;
update public.question_templates set points = 10 where points <> 10;

-- 5. Private groups ------------------------------------------------------
create table public.play_groups (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  name        text not null check (char_length(btrim(name)) between 2 and 40),
  created_by  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create table public.play_group_members (
  group_id   uuid not null references public.play_groups(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index play_group_members_user_idx on public.play_group_members (user_id);
alter table public.play_groups enable row level security;
alter table public.play_group_members enable row level security;
-- Members can see their own groups; everything else goes through the functions below.
create policy play_groups_member_read on public.play_groups for select to authenticated
  using (exists (select 1 from public.play_group_members m where m.group_id = id and m.user_id = auth.uid()));
create policy play_group_members_self_read on public.play_group_members for select to authenticated
  using (user_id = auth.uid());

create function private.new_group_code()
returns text language plpgsql set search_path = public, extensions, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  i int;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.play_groups where code = c);
  end loop;
  return c;
end $$;

create function public.create_group(p_name text)
returns table(id uuid, code text, name text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.play_groups;
begin
  perform private.require_player();
  if (select count(*) from public.play_group_members where user_id = auth.uid()) >= 20 then
    raise exception 'too_many_groups';
  end if;
  insert into public.play_groups (code, name, created_by)
  values (private.new_group_code(), btrim(p_name), auth.uid())
  returning * into g;
  insert into public.play_group_members (group_id, user_id) values (g.id, auth.uid());
  return query select g.id, g.code, g.name;
end $$;

create function public.join_group(p_code text)
returns table(id uuid, code text, name text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.play_groups;
begin
  perform private.require_player();
  select * into g from public.play_groups pg where pg.code = upper(btrim(p_code));
  if not found then raise exception 'group_not_found'; end if;
  if (select count(*) from public.play_group_members pm where pm.user_id = auth.uid()) >= 20
     and not exists (select 1 from public.play_group_members pm where pm.group_id = g.id and pm.user_id = auth.uid()) then
    raise exception 'too_many_groups';
  end if;
  if (select count(*) from public.play_group_members where group_id = g.id) >= 1000 then
    raise exception 'group_full';
  end if;
  insert into public.play_group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return query select g.id, g.code, g.name;
end $$;

create function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_player();
  delete from public.play_group_members where group_id = p_group and user_id = auth.uid();
  -- An empty group is removed.
  delete from public.play_groups g where g.id = p_group
     and not exists (select 1 from public.play_group_members m where m.group_id = g.id);
end $$;

create function public.my_groups()
returns table(id uuid, code text, name text, members integer, is_owner boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select g.id, g.code, g.name,
         (select count(*)::int from public.play_group_members m2 where m2.group_id = g.id),
         g.created_by = auth.uid()
    from public.play_groups g
    join public.play_group_members m on m.group_id = g.id and m.user_id = auth.uid()
   order by m.joined_at;
$$;

-- 6. Leaderboards --------------------------------------------------------
create function public.match_leaderboard(p_match_id uuid, p_group uuid default null, p_limit integer default 50)
returns table(rank bigint, display_name text, points integer, correct integer, is_me boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with base as (
    select s.user_id, s.points_total as points, u.display_name,
           (select count(*)::int from public.answers a where a.session_id = s.id and a.is_correct) as correct
      from public.player_sessions s
      join public.users u on u.id = s.user_id and u.deleted_at is null
     where s.match_id = p_match_id
       and (p_group is null or exists (select 1 from public.play_group_members m where m.group_id = p_group and m.user_id = s.user_id))
       and (p_group is null or exists (select 1 from public.play_group_members m where m.group_id = p_group and m.user_id = auth.uid()))
  ),
  ranked as (
    select rank() over (order by points desc) as rank, display_name, points, correct, user_id = auth.uid() as is_me
      from base
  )
  select rank, display_name, points, correct, is_me from ranked
   where rank <= least(greatest(p_limit, 1), 200) or is_me
   order by rank, display_name
   limit least(greatest(p_limit, 1), 200) + 1;
$$;

create function public.series_leaderboard(p_series_id uuid, p_group uuid default null, p_limit integer default 50)
returns table(rank bigint, display_name text, points integer, matches integer, is_me boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with base as (
    select s.user_id, sum(s.points_total)::int as points, count(*)::int as matches
      from public.player_sessions s
      join public.matches mt on mt.id = s.match_id and mt.series_id = p_series_id
     where (p_group is null or exists (select 1 from public.play_group_members m where m.group_id = p_group and m.user_id = s.user_id))
       and (p_group is null or exists (select 1 from public.play_group_members m where m.group_id = p_group and m.user_id = auth.uid()))
     group by s.user_id
  ),
  ranked as (
    select rank() over (order by b.points desc) as rank, u.display_name, b.points, b.matches, b.user_id = auth.uid() as is_me
      from base b join public.users u on u.id = b.user_id and u.deleted_at is null
  )
  select rank, display_name, points, matches, is_me from ranked
   where rank <= least(greatest(p_limit, 1), 200) or is_me
   order by rank, display_name
   limit least(greatest(p_limit, 1), 200) + 1;
$$;

-- 7. History and record without venues ----------------------------------
create or replace function public.my_match_history(p_limit integer default 30)
returns table(match_id uuid, match_title text, played_at timestamptz, venue_name text, points integer, finish bigint, players bigint, correct integer, predictions integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with mine as (select s.* from public.player_sessions s where s.user_id = auth.uid()),
  ranked as (
    select s.match_id, s.user_id,
           rank() over (partition by s.match_id order by s.points_total desc) as finish,
           count(*) over (partition by s.match_id) as players
      from public.player_sessions s
     where s.match_id in (select match_id from mine)
  )
  select m.id, m.title, mine.verified_at, null::text, mine.points_total, r.finish, r.players,
         (select count(*)::int from public.answers a where a.session_id = mine.id and a.is_correct),
         (select count(*)::int from public.answers a where a.session_id = mine.id)
    from mine
    join public.matches m on m.id = mine.match_id
    join ranked r on r.match_id = mine.match_id and r.user_id = mine.user_id
   order by mine.verified_at desc
   limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.my_record()
returns table(matches_played integer, total_points integer, predictions integer, correct integer, rewards_won integer, best_finish bigint, member_since timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select * from public.users where id = auth.uid() and deleted_at is null),
  finishes as (
    select s.user_id, rank() over (partition by s.match_id order by s.points_total desc) as r
      from public.player_sessions s
     where s.match_id in (select match_id from public.player_sessions where user_id = auth.uid())
  )
  select
    (select count(*)::int from public.player_sessions where user_id = auth.uid()),
    (select coalesce(sum(points_total), 0)::int from public.player_sessions where user_id = auth.uid()),
    (select count(*)::int from public.answers where user_id = auth.uid()),
    (select count(*)::int from public.answers where user_id = auth.uid() and is_correct),
    0,
    (select min(r) from finishes where user_id = auth.uid()),
    me.created_at
  from me;
$$;

-- 8. Sign-up: 18+, terms, no location -------------------------------------
create or replace function public.complete_onboarding(p_display_name text, p_age_21 boolean, p_age_25 boolean, p_location_consent boolean, p_terms_accepted boolean, p_marketing boolean, p_terms_version text)
returns public.users language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.users;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  -- p_age_21 now carries the 18+ confirmation; the name is kept so older app versions still work.
  if not coalesce(p_age_21, false)         then raise exception 'age_required'; end if;
  if not coalesce(p_terms_accepted, false) then raise exception 'terms_required'; end if;
  if char_length(btrim(coalesce(p_display_name, ''))) < 2 then raise exception 'name_required'; end if;

  insert into public.users as x (id, display_name, age_verified_21, age_verified_25,
                                 consent_agreed_at, location_consent_at, marketing_consent_at, terms_version)
  values (auth.uid(), btrim(p_display_name), true, false,
          now(), null, case when p_marketing then now() end, p_terms_version)
  on conflict (id) do update set
    display_name         = excluded.display_name,
    consent_agreed_at    = now(),
    marketing_consent_at = case when p_marketing then coalesce(x.marketing_consent_at, now()) end,
    terms_version        = excluded.terms_version,
    deleted_at           = null
  returning * into u;
  return u;
end $$;

-- 9. Publishing no longer asks about rewards ------------------------------
create or replace function public.match_checklist(p_match uuid)
returns text[] language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m public.matches;
  s public.series;
  t public.themes;
  sp public.sponsors;
  missing text[] := '{}';
begin
  perform private.require_role('{admin,game_master}');
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'not_found'; end if;

  if m.series_id is null then
    missing := missing || 'series';
  else
    select * into s from public.series where id = m.series_id;
    if s.theme_id is null and m.theme_id is null then missing := missing || 'theme'; end if;
    select * into t from public.themes where id = coalesce(m.theme_id, s.theme_id);
    if t.id is not null and t.sponsor_name is not null and t.logo_url is null then
      missing := missing || 'theme_logo';
    end if;
    if s.sponsor_id is null and not s.no_sponsor then missing := missing || 'sponsor'; end if;
    if s.sponsor_id is not null then
      select * into sp from public.sponsors where id = s.sponsor_id;
      if sp.logo_url is null then missing := missing || 'sponsor_logo'; end if;
      if not sp.is_active then missing := missing || 'sponsor_paused'; end if;
    end if;
    if (m.starts_at at time zone 'Asia/Kolkata')::date not between s.starts_on and s.ends_on then
      missing := missing || 'match_dates';
    end if;
  end if;
  if char_length(btrim(m.title)) < 3 then missing := missing || 'match_title'; end if;
  return missing;
end $$;

-- 10. Grants --------------------------------------------------------------
revoke all on function public.join_match(uuid), public.create_group(text), public.join_group(text),
  public.leave_group(uuid), public.my_groups(), public.match_leaderboard(uuid, uuid, integer),
  public.series_leaderboard(uuid, uuid, integer) from public, anon;
grant execute on function public.join_match(uuid), public.create_group(text), public.join_group(text),
  public.leave_group(uuid), public.my_groups(), public.match_leaderboard(uuid, uuid, integer),
  public.series_leaderboard(uuid, uuid, integer) to authenticated;
