-- =====================================================================
-- Growth features
--  1. Sponsors: per match ("presented by") and per question ("this over")
--  2. Question packs (cricket + football) and over-by-over mode
--  3. Table vs table: players pick a table, tables score their best 4
--  4. Streaks (+10 from the 3rd right answer in a row) and one
--     double-points pick per player per match
--  5. City season leaderboard (optional sponsor-funded prize)
--  6. Self-serve venue signup and billing records
--  7. Monthly venue report
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sponsors
-- ---------------------------------------------------------------------
create table public.sponsors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 60),
  logo_url    text check (logo_url is null or logo_url ~ '^https://'),
  tagline     text check (tagline is null or char_length(tagline) <= 90),
  link_url    text check (link_url is null or link_url ~ '^https://'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.sponsors enable row level security;
create policy sponsors_read on public.sponsors for select to anon, authenticated using (true);
create policy sponsors_write on public.sponsors for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

alter table public.questions add column sponsor_id uuid references public.sponsors(id) on delete set null;
alter table public.matches
  add column sponsor_id   uuid references public.sponsors(id) on delete set null,
  add column current_over smallint check (current_over is null or current_over between 1 and 120);

-- What a sponsor got: questions carried, plays, unique players, venues.
create function public.sponsor_report(p_from timestamptz default now() - interval '30 days', p_to timestamptz default now())
returns table (sponsor_id uuid, sponsor text, questions bigint, plays bigint, players bigint, venues bigint, matches bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select sp.id, sp.name,
         count(distinct q.id), count(a.id), count(distinct a.user_id), count(distinct s.venue_id), count(distinct q.match_id)
    from public.sponsors sp
    left join (
      select q.id, q.match_id, coalesce(q.sponsor_id, m.sponsor_id) as sid
        from public.questions q join public.matches m on m.id = q.match_id
       where q.status in ('live', 'locked', 'resolved') and q.pushed_at between p_from and p_to
    ) q on q.sid = sp.id
    left join public.answers a on a.question_id = q.id
    left join public.player_sessions s on s.id = a.session_id
   where private.has_role('{admin,game_master}')
   group by sp.id, sp.name
   order by count(a.id) desc;
$$;

-- ---------------------------------------------------------------------
-- 2. Question packs
-- ---------------------------------------------------------------------
create table public.question_templates (
  id               uuid primary key default gen_random_uuid(),
  pack             text not null check (char_length(btrim(pack)) between 2 and 40),
  sport            text not null default 'cricket',
  prompt           text not null check (char_length(prompt) between 5 and 160),
  options          text[] not null check (array_length(options, 1) between 2 and 6),
  points           int not null default 10 check (points between 1 and 1000),
  answer_window_s  int not null default 30 check (answer_window_s between 5 and 600),
  sort_order       int not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
alter table public.question_templates enable row level security;
create policy templates_staff on public.question_templates for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

-- {over} = current over, {home}/{away} = the two sides from "Home vs Away"
insert into public.question_templates (pack, sport, prompt, options, points, answer_window_s, sort_order) values
  ('Over by over', 'cricket', 'Over {over}: how many runs?', array['0 to 5','6 to 9','10 to 14','15+'], 20, 30, 1),
  ('Over by over', 'cricket', 'Over {over}: will a wicket fall?', array['Yes','No'], 20, 30, 2),
  ('Over by over', 'cricket', 'Over {over}: will there be a boundary?', array['Yes','No'], 10, 30, 3),
  ('Over by over', 'cricket', 'Over {over}: will there be a six?', array['Yes','No'], 15, 30, 4),
  ('Over by over', 'cricket', 'Over {over}: any wide or no-ball?', array['Yes','No'], 10, 30, 5),
  ('Over by over', 'cricket', 'Over {over}: how many dot balls?', array['0 to 1','2 to 3','4+'], 15, 30, 6),
  ('Next ball', 'cricket', 'Next ball?', array['Dot','1 to 3 runs','Boundary','Wicket'], 25, 15, 1),
  ('Next ball', 'cricket', 'Next boundary: four or six?', array['Four','Six'], 10, 20, 2),
  ('Big moments', 'cricket', 'How will the next wicket fall?', array['Caught','Bowled','LBW','Run out','Other'], 40, 30, 1),
  ('Big moments', 'cricket', 'Powerplay score?', array['Under 40','40 to 54','55 to 69','70+'], 50, 60, 2),
  ('Big moments', 'cricket', 'Will the set batter reach 50?', array['Yes','No'], 30, 45, 3),
  ('Big moments', 'cricket', 'Who wins the match?', array['{home}','{away}'], 50, 60, 4),
  ('Match flow', 'football', 'Goal in the next 10 minutes?', array['Yes','No'], 20, 45, 1),
  ('Match flow', 'football', 'Who scores next?', array['{home}','{away}','No more goals'], 30, 45, 2),
  ('Match flow', 'football', 'Next card goes to?', array['{home}','{away}','No card in 10 min'], 20, 45, 3),
  ('Match flow', 'football', 'Corner in the next 5 minutes?', array['Yes','No'], 10, 30, 4),
  ('Match flow', 'football', 'Penalty given in this half?', array['Yes','No'], 20, 45, 5),
  ('Results', 'football', 'Half-time result?', array['{home}','Draw','{away}'], 40, 60, 1),
  ('Results', 'football', 'Full-time result?', array['{home}','Draw','{away}'], 50, 60, 2),
  ('Results', 'football', 'Total goals in the match?', array['0 to 1','2 to 3','4+'], 40, 60, 3),
  ('Results', 'football', 'Both teams score?', array['Yes','No'], 30, 60, 4);

-- ---------------------------------------------------------------------
-- 3. Tables, 4. streaks and double points
-- ---------------------------------------------------------------------
alter table public.venues add column table_count smallint not null default 0 check (table_count between 0 and 200);

alter table public.player_sessions
  add column table_no     smallint check (table_no is null or table_no between 1 and 200),
  add column streak       int not null default 0,
  add column best_streak  int not null default 0,
  add column double_used  boolean not null default false;

alter table public.answers
  add column is_double     boolean not null default false,
  add column bonus_points  int not null default 0;

-- Player picks (or changes) their table. Null leaves table play.
create function public.set_my_table(p_match_id uuid, p_table smallint)
returns smallint language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.player_sessions; n smallint;
begin
  perform private.require_player();
  select * into s from public.player_sessions where user_id = auth.uid() and match_id = p_match_id for update;
  if not found then raise exception 'verification_required'; end if;
  select table_count into n from public.venues where id = s.venue_id;
  if p_table is not null and (coalesce(n, 0) = 0 or p_table < 1 or p_table > n) then raise exception 'invalid_table'; end if;
  update public.player_sessions set table_no = p_table where id = s.id;
  return p_table;
end $$;

-- Venue staff turn table play on (number of tables) or off (0).
create function public.set_venue_tables(p_venue_id uuid, p_count smallint)
returns smallint language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.manages_venue(p_venue_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_count is null or p_count < 0 or p_count > 200 then raise exception 'invalid_table'; end if;
  update public.venues set table_count = p_count where id = p_venue_id;
  return p_count;
end $$;

-- A table's score = its best 4 players, so a big table can't win on numbers alone.
create function public.get_table_leaderboard(p_match_id uuid, p_venue_id uuid, p_limit int default 20)
returns table (rank bigint, table_no smallint, players bigint, points bigint, is_mine boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with mine as (
    select table_no from public.player_sessions where user_id = auth.uid() and match_id = p_match_id
  ),
  ranked as (
    select s.table_no, s.points_total,
           row_number() over (partition by s.table_no order by s.points_total desc) as rn,
           count(*) over (partition by s.table_no) as n
      from public.player_sessions s
      join public.users u on u.id = s.user_id and u.deleted_at is null
     where s.match_id = p_match_id and s.venue_id = p_venue_id and s.table_no is not null
  ),
  tables as (
    select table_no, max(n) as players, sum(points_total) filter (where rn <= 4) as points
      from ranked group by table_no
  )
  select rank() over (order by t.points desc), t.table_no, t.players, t.points,
         t.table_no = (select table_no from mine)
    from tables t
   order by t.points desc, t.table_no
   limit least(greatest(p_limit, 1), 100);
$$;

-- New answer function with the double-points pick. The old submit_answer
-- stays (it forwards here) so phones on an older page keep working.
create function public.submit_prediction(p_question_id uuid, p_option smallint, p_double boolean default false)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q public.questions;
  s public.player_sessions;
  aid uuid;
begin
  perform private.require_player();
  select * into q from public.questions where id = p_question_id;
  if not found or q.status <> 'live' or now() >= q.locks_at then raise exception 'question_closed'; end if;
  if p_option is null or p_option < 0 or p_option >= array_length(q.options, 1) then
    raise exception 'invalid_option';
  end if;

  select * into s from public.player_sessions where user_id = auth.uid() and match_id = q.match_id for update;
  if not found or not private.session_active(s) then raise exception 'verification_required'; end if;
  if q.venue_id is not null and q.venue_id <> s.venue_id then raise exception 'question_not_for_venue'; end if;
  if coalesce(p_double, false) and s.double_used then raise exception 'double_used'; end if;

  insert into public.answers (question_id, session_id, user_id, selected_option, is_double)
  values (q.id, s.id, auth.uid(), p_option, coalesce(p_double, false))
  on conflict (question_id, user_id) do nothing
  returning id into aid;
  if aid is null then raise exception 'already_answered'; end if;

  update public.player_sessions
     set last_seen_at = now(), double_used = double_used or coalesce(p_double, false)
   where id = s.id;
  return aid;
end $$;

create or replace function public.submit_answer(p_question_id uuid, p_option smallint)
returns uuid language sql security definer set search_path = public, pg_temp as $$
  select public.submit_prediction(p_question_id, p_option, false);
$$;

-- Settlement: double points, streak bonus, reward set, bonus reward
create or replace function public.resolve_question(p_question_id uuid, p_correct_option smallint)
returns table (correct_count int, coupons_issued int)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  q public.questions;
  b public.coupon_buckets;
  sec public.coupon_bucket_secrets;
  m public.matches;
  n_correct int := 0;
  n_issued int := 0;
  n_set int := 0;
  remaining int;
  w record;
  pick uuid;
begin
  perform private.require_role('{admin,game_master}');
  select * into q from public.questions where id = p_question_id for update;
  if not found or q.status not in ('live', 'locked') then raise exception 'cannot_resolve'; end if;
  if p_correct_option < 0 or p_correct_option >= array_length(q.options, 1) then raise exception 'invalid_option'; end if;

  update public.questions
     set status = 'resolved', correct_option = p_correct_option,
         locks_at = least(locks_at, now()), resolved_at = now()
   where id = q.id;

  -- Points: base x2 if the player used their double here, +10 from the
  -- 3rd right answer in a row (streak counted per player per match).
  update public.answers a
     set is_correct = (a.selected_option = p_correct_option),
         bonus_points = case when a.selected_option = p_correct_option and s.streak + 1 >= 3 then 10 else 0 end,
         points_awarded = case when a.selected_option = p_correct_option
                               then q.points * (case when a.is_double then 2 else 1 end)
                                    + (case when s.streak + 1 >= 3 then 10 else 0 end)
                               else 0 end
    from public.player_sessions s
   where a.question_id = q.id and s.id = a.session_id;

  update public.player_sessions s
     set points_total = s.points_total + a.points_awarded,
         streak = case when a.is_correct then s.streak + 1 else 0 end,
         best_streak = greatest(s.best_streak, case when a.is_correct then s.streak + 1 else 0 end)
    from public.answers a
   where a.question_id = q.id and a.session_id = s.id;

  select count(*) into n_correct from public.answers where question_id = q.id and is_correct;

  -- (a) reward set attached to the match: one coupon per correct answer
  select * into m from public.matches where id = q.match_id;
  if m.reward_set_id is not null and exists (select 1 from public.reward_sets where id = m.reward_set_id and is_active) then
    for w in
      select a.user_id, s.venue_id,
             (select count(*) from public.answers a2
               join public.questions q2 on q2.id = a2.question_id
              where a2.user_id = a.user_id and a2.is_correct and q2.match_id = q.match_id)::int as nth
        from public.answers a
        join public.player_sessions s on s.id = a.session_id
        join public.users u on u.id = a.user_id and u.deleted_at is null
       where a.question_id = q.id and a.is_correct
       order by a.answered_at
    loop
      pick := private.pick_set_coupon(m.reward_set_id, w.user_id, w.nth);
      if pick is not null and private.issue_coupon(pick, w.user_id, q.id, w.venue_id) then
        n_set := n_set + 1;
      end if;
    end loop;
  end if;

  -- (b) optional bonus reward picked on the question itself (fastest first)
  if q.coupon_bucket_id is not null then
    select * into b from public.coupon_buckets
     where id = q.coupon_bucket_id and is_active and (valid_until is null or valid_until > now())
     for update;
    if found then
      select * into sec from public.coupon_bucket_secrets where bucket_id = b.id;
      remaining := case when b.total_quantity is null then null
                        else greatest(b.total_quantity - b.issued_count, 0) end;

      insert into public.user_coupons (bucket_id, user_id, question_id, venue_id, code, expires_at)
      select b.id, x.user_id, q.id, x.venue_id,
             case b.code_mode
               when 'unique' then 'MD-' || upper(encode(gen_random_bytes(4), 'hex'))
               when 'static' then sec.static_code
             end,
             b.valid_until
        from (
          select a.user_id, s.venue_id
            from public.answers a
            join public.player_sessions s on s.id = a.session_id
            join public.users u on u.id = a.user_id and u.deleted_at is null
           where a.question_id = q.id and a.is_correct
             and (b.min_age = 21 or u.age_verified_25)
             and not exists (
               select 1 from public.user_coupons uc
                 join public.questions q2 on q2.id = uc.question_id
                where uc.user_id = a.user_id and uc.bucket_id = b.id and q2.match_id = q.match_id)
           order by a.answered_at
           limit remaining
        ) x
      on conflict do nothing;
      get diagnostics n_issued = row_count;

      update public.coupon_buckets set issued_count = issued_count + n_issued where id = b.id;
    end if;
  end if;

  return query select n_correct, n_issued + n_set;
end $$;

-- Voiding gives a player their double back if they spent it on that question.
create or replace function public.void_question(p_question_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('{admin,game_master}');
  update public.questions set status = 'void', locks_at = least(coalesce(locks_at, now()), now())
   where id = p_question_id and status in ('draft', 'live', 'locked');
  if not found then raise exception 'cannot_void'; end if;
  update public.player_sessions s set double_used = false
    from public.answers a
   where a.question_id = p_question_id and a.is_double and a.session_id = s.id;
end $$;

-- ---------------------------------------------------------------------
-- 5. City season leaderboard
-- ---------------------------------------------------------------------
create table public.seasons (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 3 and 60),
  city             text not null,
  starts_on        date not null,
  ends_on          date not null,
  prize_text       text check (prize_text is null or char_length(prize_text) <= 160),
  prize_terms_url  text check (prize_terms_url is null or prize_terms_url ~ '^https://'),
  sponsor_id       uuid references public.sponsors(id) on delete set null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint seasons_dates check (ends_on >= starts_on)
);
alter table public.seasons enable row level security;
create policy seasons_read on public.seasons for select to anon, authenticated using (true);
create policy seasons_write on public.seasons for all to authenticated
  using (private.has_role('{admin}')) with check (private.has_role('{admin}'));

create function public.city_leaderboard(p_season_id uuid, p_limit int default 50)
returns table (rank bigint, display_name text, points bigint, matches bigint, home_venue text, is_me boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with se as (select * from public.seasons where id = p_season_id and is_active),
  rows as (
    select s.user_id, s.points_total, v.name as venue
      from public.player_sessions s
      join public.venues v on v.id = s.venue_id
      join public.matches m on m.id = s.match_id
      join se on lower(btrim(v.city)) = lower(btrim(se.city))
             and (m.starts_at at time zone 'Asia/Kolkata')::date between se.starts_on and se.ends_on
  ),
  totals as (
    select r.user_id, sum(r.points_total) as points, count(*) as matches,
           mode() within group (order by r.venue) as home_venue
      from rows r group by r.user_id
  ),
  ranked as (
    select rank() over (order by t.points desc) as rank, u.display_name, t.points, t.matches, t.home_venue,
           t.user_id = auth.uid() as is_me
      from totals t join public.users u on u.id = t.user_id and u.deleted_at is null
     where t.points > 0
  )
  select * from ranked
   where rank <= least(greatest(p_limit, 1), 200) or is_me
   order by rank, display_name
   limit least(greatest(p_limit, 1), 200) + 1;
$$;

-- ---------------------------------------------------------------------
-- 6. Venue accounts, signup and billing
-- ---------------------------------------------------------------------
create type public.venue_plan as enum ('pilot', 'season', 'per_reward');
create type public.billing_status as enum ('pending', 'trial', 'active', 'past_due', 'cancelled');

create table public.venue_accounts (
  venue_id       uuid primary key references public.venues(id) on delete cascade,
  plan           public.venue_plan not null default 'season',
  status         public.billing_status not null default 'pending',
  contact_name   text,
  contact_phone  text,
  contact_email  text,
  gstin          text check (gstin is null or gstin ~ '^[0-9A-Z]{15}$'),
  paid_until     date,
  approved_at    timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.venue_accounts enable row level security;
create policy venue_accounts_read on public.venue_accounts for select to authenticated
  using (private.manages_venue(venue_id));
create policy venue_accounts_admin on public.venue_accounts for all to authenticated
  using (private.has_role('{admin}')) with check (private.has_role('{admin}'));

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  venue_id             uuid not null references public.venues(id) on delete cascade,
  plan                 public.venue_plan not null,
  amount_paise         int not null check (amount_paise > 0),
  currency             text not null default 'INR',
  provider             text not null default 'razorpay',
  provider_order_id    text unique,
  provider_payment_id  text,
  status               text not null default 'created' check (status in ('created', 'paid', 'failed')),
  created_at           timestamptz not null default now(),
  paid_at              timestamptz
);
alter table public.payments enable row level security;
create policy payments_read on public.payments for select to authenticated
  using (private.manages_venue(venue_id));
-- Payments are written only by the server (service role) after Razorpay confirms.

alter table public.app_settings
  add column season_price_inr     int not null default 15000 check (season_price_inr between 0 and 10000000),
  add column per_reward_price_inr int not null default 10 check (per_reward_price_inr between 0 and 100000),
  add column season_ends_on       date,
  add column signup_open          boolean not null default true;

-- Venues added by an admin start as active pilot accounts; the signup
-- flow switches its own venue to pending until approved or paid.
create function private.on_venue_account()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.venue_accounts (venue_id, plan, status, approved_at)
  values (new.id, 'pilot', 'active', now()) on conflict do nothing;
  return new;
end $$;
create trigger venues_create_account after insert on public.venues
  for each row execute function private.on_venue_account();

-- Existing venues keep working: they count as active pilot accounts.
insert into public.venue_accounts (venue_id, plan, status, approved_at)
select id, 'pilot', 'active', now() from public.venues
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 7. Monthly venue report
-- ---------------------------------------------------------------------
create function public.venue_monthly_report(p_venue_id uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m0 timestamptz := (date_trunc('month', p_month)::timestamp at time zone 'Asia/Kolkata');
  m1 timestamptz := ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'Asia/Kolkata');
  p0 timestamptz := ((date_trunc('month', p_month) - interval '1 month')::timestamp at time zone 'Asia/Kolkata');
  out jsonb;
begin
  if not private.manages_venue(p_venue_id) then raise exception 'forbidden' using errcode = '42501'; end if;

  with ses as (
    select s.* from public.player_sessions s where s.venue_id = p_venue_id and s.verified_at >= m0 and s.verified_at < m1
  ),
  prev as (
    select s.* from public.player_sessions s where s.venue_id = p_venue_id and s.verified_at >= p0 and s.verified_at < m0
  ),
  firsts as (
    select user_id, min(verified_at) as first_at from public.player_sessions where venue_id = p_venue_id group by user_id
  ),
  per_player as (
    select user_id, count(*) as nights, sum(points_total) as points from ses group by user_id
  ),
  ans as (
    select a.* from public.answers a join ses on ses.id = a.session_id
  ),
  won as (
    select uc.* from public.user_coupons uc where uc.venue_id = p_venue_id and uc.issued_at >= m0 and uc.issued_at < m1
  ),
  redeemed as (
    select uc.* from public.user_coupons uc where uc.venue_id = p_venue_id and uc.redeemed_at >= m0 and uc.redeemed_at < m1
  )
  select jsonb_build_object(
    'month', to_char(date_trunc('month', p_month), 'FMMonth YYYY'),
    'venue', (select name from public.venues where id = p_venue_id),
    'match_nights', (select count(distinct match_id) from ses),
    'checkins', (select count(*) from ses),
    'unique_players', (select count(*) from per_player),
    'new_players', (select count(*) from per_player pp join firsts f using (user_id) where f.first_at >= m0),
    'returning_players', (select count(*) from per_player pp join firsts f using (user_id) where f.first_at < m0),
    'regulars', (select count(*) from per_player where nights >= 2),
    'by_method', jsonb_build_object(
        'qr', (select count(*) from ses where verification_method = 'qr'),
        'gps', (select count(*) from ses where verification_method = 'gps'),
        'pin', (select count(*) from ses where verification_method = 'pin')),
    'table_players', (select count(*) from ses where table_no is not null),
    'predictions', (select count(*) from ans),
    'correct', (select count(*) from ans where is_correct),
    'avg_predictions', (select round(count(*)::numeric / nullif((select count(*) from ses), 0), 1) from ans),
    'rewards_won', (select count(*) from won),
    'rewards_redeemed', (select count(*) from redeemed),
    'offers_opt_in', (select count(*) from per_player pp join public.users u on u.id = pp.user_id
                       where u.marketing_consent_at is not null and u.deleted_at is null),
    'prev_checkins', (select count(*) from prev),
    'prev_unique_players', (select count(distinct user_id) from prev),
    'top_matches', coalesce((
        select jsonb_agg(x order by (x->>'players')::int desc) from (
          select jsonb_build_object('title', m.title, 'starts_at', m.starts_at, 'sport', m.sport,
                                    'players', count(*), 'predictions',
                                    (select count(*) from ans a join ses s2 on s2.id = a.session_id where s2.match_id = m.id)) as x
            from ses join public.matches m on m.id = ses.match_id
           group by m.id, m.title, m.starts_at, m.sport
           order by count(*) desc limit 5) t), '[]'::jsonb),
    'busiest_days', coalesce((
        select jsonb_agg(jsonb_build_object('day', d, 'checkins', n) order by n desc) from (
          select to_char(verified_at at time zone 'Asia/Kolkata', 'FMDay') as d, count(*) as n
            from ses group by 1) t), '[]'::jsonb),
    'top_players', coalesce((
        select jsonb_agg(jsonb_build_object('name', u.display_name, 'points', pp.points, 'nights', pp.nights)
                         order by pp.points desc)
          from (select * from per_player order by points desc limit 5) pp
          join public.users u on u.id = pp.user_id and u.deleted_at is null), '[]'::jsonb),
    'top_rewards', coalesce((
        select jsonb_agg(jsonb_build_object('title', b.title, 'won', t.won, 'redeemed', t.red) order by t.won desc)
          from (select bucket_id, count(*) as won, count(redeemed_at) as red from won group by bucket_id
                order by count(*) desc limit 5) t
          join public.coupon_buckets b on b.id = t.bucket_id), '[]'::jsonb),
    'billing', (
        select jsonb_build_object('plan', va.plan, 'status', va.status, 'paid_until', va.paid_until,
                                  'per_reward_price_inr', st.per_reward_price_inr,
                                  'amount_due_inr', case when va.plan = 'per_reward'
                                                         then st.per_reward_price_inr * (select count(*) from redeemed) else 0 end)
          from public.venue_accounts va, public.app_settings st where va.venue_id = p_venue_id)
  ) into out;
  return out;
end $$;

-- ---------------------------------------------------------------------
-- Audit, privileges
-- ---------------------------------------------------------------------
create trigger sponsors_audit after insert or update or delete on public.sponsors
  for each row execute function private.audit_generic();
create trigger seasons_audit after insert or update or delete on public.seasons
  for each row execute function private.audit_generic();
create trigger venue_accounts_audit after insert or update or delete on public.venue_accounts
  for each row execute function private.audit_generic();

revoke execute on function
  public.sponsor_report(timestamptz, timestamptz),
  public.set_my_table(uuid, smallint),
  public.set_venue_tables(uuid, smallint),
  public.get_table_leaderboard(uuid, uuid, int),
  public.submit_prediction(uuid, smallint, boolean),
  public.city_leaderboard(uuid, int),
  public.venue_monthly_report(uuid, date)
from public, anon;

grant execute on function
  public.sponsor_report(timestamptz, timestamptz),
  public.set_my_table(uuid, smallint),
  public.set_venue_tables(uuid, smallint),
  public.get_table_leaderboard(uuid, uuid, int),
  public.submit_prediction(uuid, smallint, boolean),
  public.city_leaderboard(uuid, int),
  public.venue_monthly_report(uuid, date)
to authenticated;

-- A venue's own staff can see it while it waits for approval.
alter policy venues_read on public.venues
  using (is_active or private.has_role('{admin,game_master}') or private.manages_venue(id));
