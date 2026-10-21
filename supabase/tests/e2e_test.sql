-- End-to-end database test. Runs against the stub + migration + seed.
-- Every check raises on failure; the script prints ALL_TESTS_PASSED at the end.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ---------- test helpers (created as superuser) ----------
create or replace function public.t_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, false);
end $$;

create or replace function public.t_expect_error(stmt text, pattern text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'EXPECTED ERROR matching "%" but statement succeeded: %', pattern, stmt;
exception when others then
  if sqlerrm like 'EXPECTED ERROR%' then raise; end if;
  if sqlerrm !~* pattern then
    raise exception 'Wrong error for %: got "%" expected /%/', stmt, sqlerrm, pattern;
  end if;
end $$;
grant execute on function public.t_as(uuid), public.t_expect_error(text, text) to authenticated, anon;

-- ---------- actors ----------
insert into auth.users (id, phone) values
  ('11111111-0000-0000-0000-000000000001', '+910000000001'),  -- Asha, 25+, GPS
  ('11111111-0000-0000-0000-000000000002', '+910000000002'),  -- Bilal, 21 only, PIN
  ('11111111-0000-0000-0000-000000000003', '+910000000003'),  -- Chirag, never onboarded
  ('11111111-0000-0000-0000-000000000004', '+910000000004'),  -- Dev, PIN guesser
  ('22222222-0000-0000-0000-000000000001', null),             -- Game Master
  ('22222222-0000-0000-0000-000000000002', null),             -- Venue manager (demo venue)
  ('22222222-0000-0000-0000-000000000003', null);             -- Venue manager (other venue)

insert into public.venues (id, name, slug, location)
values ('00000000-0000-0000-0000-0000000000b2', 'Other Bar', 'other-bar',
        extensions.st_setsrid(extensions.st_makepoint(72.9, 19.1), 4326)::extensions.geography);

insert into public.staff (user_id, role, venue_id) values
  ('22222222-0000-0000-0000-000000000001', 'game_master', null),
  ('22222222-0000-0000-0000-000000000002', 'venue_manager', '00000000-0000-0000-0000-0000000000b1'),
  ('22222222-0000-0000-0000-000000000003', 'venue_manager', '00000000-0000-0000-0000-0000000000b2');

-- secret-PIN check: the trigger created a secret for the new venue
do $$ begin
  assert (select count(*) from public.venue_secrets) = 2, 'venue secret trigger';
end $$;

set role authenticated;

-- ---------- onboarding ----------
select t_as('11111111-0000-0000-0000-000000000001');
select t_expect_error($$select complete_onboarding('Asha', false, false, true, true, false, 'v1')$$, 'age_21_required');
select t_expect_error($$select complete_onboarding('Asha', true, false, false, true, false, 'v1')$$, 'location_consent_required');
select complete_onboarding('Asha', true, true, true, true, true, 'v1');

select t_as('11111111-0000-0000-0000-000000000002');
select complete_onboarding('Bilal', true, false, true, true, false, 'v1');
select t_as('11111111-0000-0000-0000-000000000004');
select complete_onboarding('Dev', true, false, true, true, false, 'v1');

do $$ begin
  assert (select count(*) from public.users) = 1, 'patron sees only own profile';
  assert (select consent_agreed_at is not null and age_verified_21 from public.users), 'consent timestamps stored';
end $$;

-- ---------- GPS verification ----------
select t_as('11111111-0000-0000-0000-000000000001');
do $$
declare r record;
begin
  -- ~1.1 km away: rejected
  select * into r from verify_presence_gps('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 19.0037, 72.8258);
  assert not r.ok and r.reason = 'out_of_range', 'far away must fail: ' || coalesce(r.reason, 'null');
  -- ~55 m away: accepted
  select * into r from verify_presence_gps('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 18.9942, 72.8258);
  assert r.ok and r.distance_m between 40 and 70, 'near must pass, distance=' || r.distance_m;
end $$;

-- ---------- PIN verification ----------
select t_as('22222222-0000-0000-0000-000000000003');
select t_expect_error($$select * from current_venue_pin('00000000-0000-0000-0000-0000000000b1')$$, 'forbidden');

select t_as('22222222-0000-0000-0000-000000000002');
select pin as demo_pin from current_venue_pin('00000000-0000-0000-0000-0000000000b1') \gset
do $$ begin
  assert (select pin ~ '^\d{4}$' and valid_until > now() and valid_until <= now() + interval '10 minutes'
            from current_venue_pin('00000000-0000-0000-0000-0000000000b1')), 'pin shape and 10-min validity';
end $$;

select t_as('11111111-0000-0000-0000-000000000002');
do $$ declare r record; begin
  select * into r from verify_presence_pin('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'abcd');
  assert not r.ok and r.reason = 'wrong_pin', 'non-numeric pin rejected';
end $$;
select ok as bilal_ok from verify_presence_pin('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', :'demo_pin') \gset
\if :bilal_ok
\else
  \echo 'FAIL: correct PIN rejected'
  select 1/0;
\endif

-- brute force protection: 5 wrong guesses then blocked, even with the right PIN
select t_as('11111111-0000-0000-0000-000000000004');
select ok from verify_presence_pin('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '0000') \g /dev/null
select ok from verify_presence_pin('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '0001') \g /dev/null
select ok from verify_presence_pin('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '0002') \g /dev/null
select ok from verify_presence_pin('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '0003') \g /dev/null
select ok from verify_presence_pin('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '0004') \g /dev/null
select reason as dev_reason from verify_presence_pin('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', :'demo_pin') \gset
\echo PIN lockout reason: :dev_reason

-- ---------- patron isolation ----------
select t_as('11111111-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.questions) = 0, 'drafts hidden from patrons';
  assert (select count(*) from public.coupon_bucket_secrets) = 0, 'affiliate URLs hidden';
  assert (select count(*) from public.venue_secrets) = 0, 'pin secrets hidden';
  assert (select count(*) from public.pin_attempts) = 0, 'pin attempts hidden';
  assert (select count(*) from public.player_sessions) = 1, 'own session only';
end $$;
update public.player_sessions set points_total = 9999;   -- RLS: silently 0 rows
do $$ begin assert (select points_total from public.player_sessions) = 0, 'patron cannot edit points'; end $$;
select t_expect_error($$insert into public.answers (question_id, session_id, user_id, selected_option)
  select gen_random_uuid(), s.id, s.user_id, 0 from public.player_sessions s limit 1$$, 'row-level security');
select t_expect_error($$select push_question((select id from public.questions limit 1))$$, 'forbidden');

-- ---------- live question with venue reward ----------
select t_as('22222222-0000-0000-0000-000000000001');
select id as q1 from public.questions where prompt like 'Will the next over%' \gset
select status from push_question(:'q1') \g /dev/null

select t_as('11111111-0000-0000-0000-000000000001');
do $$ begin
  assert (select correct_option is null from public.questions where status = 'live'), 'answer not leaked while live';
end $$;
select t_expect_error(format('select submit_answer(%L, 5::smallint)', :'q1'), 'invalid_option');
select submit_answer(:'q1', 0::smallint) \g /dev/null
select t_expect_error(format('select submit_answer(%L, 1::smallint)', :'q1'), 'already_answered');

select t_as('11111111-0000-0000-0000-000000000002');
select submit_answer(:'q1', 1::smallint) \g /dev/null

select t_as('11111111-0000-0000-0000-000000000003');
select t_expect_error(format('select submit_answer(%L, 0::smallint)', :'q1'), 'onboarding_required');

select t_as('22222222-0000-0000-0000-000000000001');
do $$ declare r record; begin
  select * into r from resolve_question((select id from public.questions where prompt like 'Will the next over%'), 0::smallint);
  assert r.correct_count = 1 and r.coupons_issued = 1, format('q1 resolve: %s correct, %s issued', r.correct_count, r.coupons_issued);
end $$;

select t_as('11111111-0000-0000-0000-000000000002');
select t_expect_error(format('select submit_answer(%L, 0::smallint)', :'q1'), 'question_closed');

-- ---------- spirits reward is 25+ only ----------
select t_as('22222222-0000-0000-0000-000000000001');
insert into public.coupon_buckets (id, brand_name, title, is_alcohol, min_age, code_mode)
values ('00000000-0000-0000-0000-0000000000d9', 'Demo Spirits', 'Free whisky shot', true, 25, 'unique');
insert into public.questions (id, match_id, prompt, options, points, coupon_bucket_id)
values ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000c1',
        'Six in the next over?', '{Yes,No}', 20, '00000000-0000-0000-0000-0000000000d9');
select status from push_question('00000000-0000-0000-0000-0000000000e9') \g /dev/null

select t_as('11111111-0000-0000-0000-000000000001');
select submit_answer('00000000-0000-0000-0000-0000000000e9', 0::smallint) \g /dev/null
select t_as('11111111-0000-0000-0000-000000000002');
select submit_answer('00000000-0000-0000-0000-0000000000e9', 0::smallint) \g /dev/null

select t_as('22222222-0000-0000-0000-000000000001');
do $$ declare r record; begin
  select * into r from resolve_question('00000000-0000-0000-0000-0000000000e9', 0::smallint);
  assert r.correct_count = 2 and r.coupons_issued = 1, format('spirits: %s correct, %s issued (want 2,1)', r.correct_count, r.coupons_issued);
end $$;

select t_as('11111111-0000-0000-0000-000000000002');
do $$ begin
  assert (select count(*) from public.user_coupons) = 0, 'Bilal (21) gets points but no spirits reward';
  assert (select points_total from public.player_sessions) = 20, 'Bilal points = 20';
end $$;

select t_as('11111111-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from public.user_coupons) = 2, 'Asha wallet has 2 rewards';
  assert (select points_total from public.player_sessions) = 30, 'Asha points = 30';
  assert (select count(*) from get_leaderboard('00000000-0000-0000-0000-0000000000c1', null, 50)) = 2, 'leaderboard rows';
  assert (select rank = 1 and is_me from get_leaderboard('00000000-0000-0000-0000-0000000000c1', null, 50) where display_name = 'Asha'), 'Asha rank 1';
end $$;
select code as asha_code from public.user_coupons where code like 'MD-%' order by issued_at limit 1 \gset

-- ---------- venue redemption ----------
select t_as('22222222-0000-0000-0000-000000000003');
select t_expect_error(format('select * from redeem_coupon(%L, %L)', '00000000-0000-0000-0000-0000000000b2', :'asha_code'), 'code_from_another_venue');
select t_as('22222222-0000-0000-0000-000000000002');
select title, player from redeem_coupon('00000000-0000-0000-0000-0000000000b1', lower(:'asha_code'));
select t_expect_error(format('select * from redeem_coupon(%L, %L)', '00000000-0000-0000-0000-0000000000b1', :'asha_code'), 'already_redeemed');
do $$ begin
  assert (select count(*) from venue_live_players('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1')) = 2, 'venue sees 2 players';
end $$;

-- ---------- session stays valid; silent GPS re-check catches someone who left ----------
select t_as('11111111-0000-0000-0000-000000000001');
do $$ declare r record; begin
  select * into r from session_heartbeat('00000000-0000-0000-0000-0000000000c1', 18.9940, 72.8259);
  assert r.active, 'heartbeat inside venue keeps session';
  select * into r from session_heartbeat('00000000-0000-0000-0000-0000000000c1', 19.0800, 72.8800);
  assert not r.active and r.needs_reverify, 'heartbeat from home ends session';
end $$;
select t_as('22222222-0000-0000-0000-000000000001');
insert into public.questions (id, match_id, prompt, options) values
  ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000c1', 'Wide in this over?', '{Yes,No}');
select status from push_question('00000000-0000-0000-0000-0000000000e8') \g /dev/null
select t_as('11111111-0000-0000-0000-000000000001');
select t_expect_error($$select submit_answer('00000000-0000-0000-0000-0000000000e8', 0::smallint)$$, 'verification_required');

-- PIN player idle for 50 minutes must re-verify
reset role;
update public.player_sessions set last_seen_at = now() - interval '50 minutes'
 where user_id = '11111111-0000-0000-0000-000000000002';
set role authenticated;
select t_as('11111111-0000-0000-0000-000000000002');
do $$ declare r record; begin
  select * into r from session_heartbeat('00000000-0000-0000-0000-0000000000c1');
  assert not r.active, 'idle 50 min => re-verify';
end $$;
select t_expect_error($$select submit_answer('00000000-0000-0000-0000-0000000000e8', 0::smallint)$$, 'verification_required');

-- ---------- anon cannot do anything sensitive ----------
reset role;
set role anon;
select t_expect_error($$select complete_onboarding('x', true, false, true, true, false, 'v1')$$, 'permission denied');
do $$ begin
  assert (select count(*) from public.venues) = 2, 'anon can list active venues';
  assert (select count(*) from public.questions) = 0, 'anon sees no questions';
end $$;

reset role;
select lat::numeric(8,4), lng::numeric(8,4) from public.venue_directory where slug = 'demo-dugout';
-- =====================================================================
-- TV QR check-in, same-reward-once rule, player record
-- =====================================================================
insert into auth.users (id, phone) values ('11111111-0000-0000-0000-000000000005', '+910000000005');
select private.venue_qr_code('00000000-0000-0000-0000-0000000000b1', private.qr_window()) as qr_now \gset
select private.venue_qr_code('00000000-0000-0000-0000-0000000000b1', private.qr_window() - 2) as qr_old \gset

-- scanning happens before login: anon can claim, but only with a fresh code
set role anon;
do $$ begin
  assert (select count(*) from claim_qr_ticket('demo-dugout', 'ffffffffffffffff')) = 0, 'fake QR code rejected';
  assert (select count(*) from claim_qr_ticket('demo-dugout', 'not-hex')) = 0, 'malformed QR code rejected';
end $$;
select count(*) as stale_claims from claim_qr_ticket('demo-dugout', :'qr_old') \gset
\if :stale_claims
  \echo 'FAIL: stale QR (60+ seconds old) was accepted'
  select 1/0;
\endif
select ticket as esha_ticket from claim_qr_ticket('DEMO-DUGOUT', :'qr_now') \gset
select ticket as spare_ticket from claim_qr_ticket('demo-dugout', :'qr_now') \gset
reset role;
do $$ begin
  assert (select count(*) from public.presence_tickets) = 2, 'tickets stored';
end $$;

set role authenticated;
-- anon-only? no: patrons cannot read tickets or call the TV code function
select t_as('11111111-0000-0000-0000-000000000005');
select complete_onboarding('Esha', true, false, true, true, false, 'v1') \g /dev/null
do $$ begin assert (select count(*) from public.presence_tickets) = 0, 'tickets hidden'; end $$;
select t_expect_error($$select * from current_venue_qr('00000000-0000-0000-0000-0000000000b1')$$, 'forbidden');

select ok as esha_ok from verify_presence_qr(:'esha_ticket', '00000000-0000-0000-0000-0000000000c1') \gset
\if :esha_ok
\else
  \echo 'FAIL: valid QR ticket rejected'
  select 1/0;
\endif
do $$ begin
  assert (select verification_method = 'qr' from public.player_sessions), 'session method = qr';
end $$;

-- a used ticket can't check in anyone else
select t_as('11111111-0000-0000-0000-000000000004');
select reason as reuse_reason from verify_presence_qr(:'esha_ticket', '00000000-0000-0000-0000-0000000000c1') \gset
\echo QR ticket reuse: :reuse_reason

-- venue staff can read the TV code
select t_as('22222222-0000-0000-0000-000000000002');
do $$ begin
  assert (select code ~ '^[0-9a-f]{16}$' and valid_until <= now() + interval '30 seconds'
            from current_venue_qr('00000000-0000-0000-0000-0000000000b1')), 'TV code shape and 30s life';
end $$;

-- same reward can only be won once per match
select t_as('22222222-0000-0000-0000-000000000001');
insert into public.questions (id, match_id, prompt, options, coupon_bucket_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'Four off the next ball?', '{Yes,No}', '00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', 'Four off the ball after?', '{Yes,No}', '00000000-0000-0000-0000-0000000000d2');
select status from push_question('00000000-0000-0000-0000-0000000000f1') \g /dev/null
select status from push_question('00000000-0000-0000-0000-0000000000f2') \g /dev/null
select t_as('11111111-0000-0000-0000-000000000005');
select submit_answer('00000000-0000-0000-0000-0000000000f1', 0::smallint) \g /dev/null
select submit_answer('00000000-0000-0000-0000-0000000000f2', 0::smallint) \g /dev/null
select t_as('22222222-0000-0000-0000-000000000001');
do $$ declare a record; b record; begin
  select * into a from resolve_question('00000000-0000-0000-0000-0000000000f1', 0::smallint);
  select * into b from resolve_question('00000000-0000-0000-0000-0000000000f2', 0::smallint);
  assert a.coupons_issued = 1 and b.coupons_issued = 0, format('same reward twice: %s then %s', a.coupons_issued, b.coupons_issued);
  assert b.correct_count = 1, 'points still awarded on the repeat';
end $$;

-- player record survives logout/login: it is keyed to the account, not the device
select t_as('11111111-0000-0000-0000-000000000005');
do $$ declare r record; h record; begin
  select * into r from my_record();
  assert r.matches_played = 1 and r.total_points = 20 and r.predictions = 2 and r.correct = 2 and r.rewards_won = 1,
    format('record: %s', row_to_json(r));
  select * into h from my_match_history();
  assert h.match_title = 'MI vs CSK' and h.points = 20 and h.correct = 2 and h.players >= 3, format('history: %s', row_to_json(h));
end $$;
select set_config('request.jwt.claims', '', false);   -- "log out"
do $$ begin assert (select count(*) from my_record()) = 0, 'logged out sees nothing'; end $$;
select t_as('11111111-0000-0000-0000-000000000005');   -- "log back in"
do $$ begin
  assert (select total_points from my_record()) = 20, 'record back after login';
  assert (select count(*) from public.user_coupons) = 1, 'wallet back after login';
end $$;
reset role;


-- =====================================================================
-- Reward sets: Z2 on first right answer, Z6 every 10th, rest random
-- =====================================================================
set role authenticated;
select t_as('22222222-0000-0000-0000-000000000001');
insert into public.reward_sets (id, code, name) values ('00000000-0000-0000-0000-00000000aa01', 'Z', 'Test set Z');
insert into public.matches (id, title, starts_at, status, reward_set_id)
values ('00000000-0000-0000-0000-00000000cc02', 'Set match', now(), 'live', '00000000-0000-0000-0000-00000000aa01');
-- Z1..Z6: Z2 = first_correct, Z6 = every 10, Z4 limited to 1, others random
insert into public.coupon_buckets (brand_name, title, code_mode, set_id, rule, rule_n, total_quantity)
select 'Brand', 'Z coupon ' || g, 'unique', '00000000-0000-0000-0000-00000000aa01',
       case g when 2 then 'first_correct'::reward_rule when 6 then 'every_n_correct'::reward_rule else 'random'::reward_rule end,
       case g when 6 then 10 end,
       case g when 4 then 1 end
  from generate_series(1, 6) g;
do $$ begin
  assert (select string_agg(set_position::text, ',' order by set_position) from public.coupon_buckets
           where set_id = '00000000-0000-0000-0000-00000000aa01') = '1,2,3,4,5,6', 'auto positions 1..6';
end $$;

-- Esha checks in to the set match by PIN-free path (superuser shortcut)
reset role;
insert into public.player_sessions (user_id, venue_id, match_id, verification_method)
values ('11111111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000cc02', 'qr'),
       ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000cc02', 'gps');
set role authenticated;

-- 12 questions; Esha answers all right, Asha answers only the first one right
do $$
declare i int; qid uuid;
begin
  for i in 1..12 loop
    perform set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000001"}', false);
    insert into public.questions (match_id, prompt, options) values ('00000000-0000-0000-0000-00000000cc02', 'Set q ' || i, '{Yes,No}')
      returning id into qid;
    perform push_question(qid);
    perform set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000005"}', false);
    perform submit_answer(qid, 0::smallint);
    perform set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000001"}', false);
    perform submit_answer(qid, case when i = 1 then 0 else 1 end::smallint);
    perform set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000001"}', false);
    perform resolve_question(qid, 0::smallint);
  end loop;
end $$;

reset role;
do $$
declare first_esha int; tenth_esha int; total_esha int; asha_first int; z4 int; wrong_answers int;
begin
  select b.set_position into first_esha from public.user_coupons uc join public.coupon_buckets b on b.id = uc.bucket_id
    join public.questions q on q.id = uc.question_id
   where uc.user_id = '11111111-0000-0000-0000-000000000005' and q.prompt = 'Set q 1';
  select b.set_position into tenth_esha from public.user_coupons uc join public.coupon_buckets b on b.id = uc.bucket_id
    join public.questions q on q.id = uc.question_id
   where uc.user_id = '11111111-0000-0000-0000-000000000005' and q.prompt = 'Set q 10';
  select count(*) into total_esha from public.user_coupons uc join public.coupon_buckets b on b.id = uc.bucket_id
   where uc.user_id = '11111111-0000-0000-0000-000000000005' and b.set_id = '00000000-0000-0000-0000-00000000aa01';
  select b.set_position into asha_first from public.user_coupons uc join public.coupon_buckets b on b.id = uc.bucket_id
   where uc.user_id = '11111111-0000-0000-0000-000000000001' and b.set_id = '00000000-0000-0000-0000-00000000aa01';
  select issued_count into z4 from public.coupon_buckets where set_id = '00000000-0000-0000-0000-00000000aa01' and set_position = 4;
  select count(*) into wrong_answers from public.user_coupons uc join public.coupon_buckets b on b.id = uc.bucket_id
   where uc.user_id = '11111111-0000-0000-0000-000000000001' and b.set_id = '00000000-0000-0000-0000-00000000aa01';
  assert first_esha = 2, 'first right answer => Z2, got Z' || first_esha;
  assert tenth_esha = 6, '10th right answer => Z6, got Z' || tenth_esha;
  assert total_esha = 12, '100% distribution: 12 right answers => 12 coupons, got ' || total_esha;
  assert asha_first = 2 and wrong_answers = 1, 'Asha: 1 right => only Z2';
  assert z4 <= 1, 'Z4 quantity limit respected';
  assert (select count(*) from public.user_coupons uc join public.coupon_buckets b on b.id = uc.bucket_id
           join public.questions q on q.id = uc.question_id
          where uc.user_id = '11111111-0000-0000-0000-000000000005' and b.set_id = '00000000-0000-0000-0000-00000000aa01'
            and q.prompt not in ('Set q 1', 'Set q 10') and b.rule <> 'random') = 0,
    'non-event answers come from the random pool';
end $$;
\echo REWARD_SETS_OK

\echo ALL_TESTS_PASSED
