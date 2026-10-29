-- =====================================================================
-- Rooms: trivia with friends, anywhere (and Solo / Daily quiz)
--  * trivia bank: questions written by AI (and checked) or seeded/admin
--  * rooms: a private game with its own code; runs itself on the server
--  * modes: classic, speed, hotseat, pass (one phone), topics, teams
--  * reports: two reports pull a question and void it everywhere
-- Answers are never readable by players until the question is revealed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categories and question bank
-- ---------------------------------------------------------------------
create table public.trivia_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 40),
  emoji        text,
  kind         text not null default 'general' check (kind in ('sports', 'bollywood', 'current', 'general')),
  description  text,
  sponsor_id   uuid references public.sponsors(id) on delete set null,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.trivia_categories enable row level security;
create policy trivia_categories_read on public.trivia_categories for select to anon, authenticated
  using (is_active or private.has_role('{admin,game_master}'));
create policy trivia_categories_write on public.trivia_categories for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

insert into public.trivia_categories (slug, name, emoji, kind, description, sort_order) values
  ('cricket',  'Cricket',          '🏏', 'sports',    'Records, legends and IPL moments', 1),
  ('sports',   'Sports',           '🏆', 'sports',    'Football, Olympics, tennis and more', 2),
  ('bollywood','Bollywood',        '🎬', 'bollywood', 'Films, stars, songs and dialogues', 3),
  ('current',  'Current affairs',  '📰', 'current',   'This week''s news, checked against sources', 4),
  ('general',  'General knowledge','🧠', 'general',   'A bit of everything', 5);

create table public.trivia_questions (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid references public.trivia_categories(id) on delete set null,
  topic           text,                             -- custom topic (lowercase) for AI rooms
  prompt          text not null check (char_length(prompt) between 8 and 220),
  options         text[] not null check (array_length(options, 1) between 2 and 4),
  correct_option  smallint not null,
  explanation     text,
  source_url      text check (source_url is null or source_url ~ '^https://'),
  source_title    text,
  difficulty      smallint not null default 2 check (difficulty between 1 and 3),
  status          text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'pulled')),
  origin          text not null default 'ai' check (origin in ('ai', 'seed', 'admin')),
  checks          jsonb,
  reports         int not null default 0,
  times_used      int not null default 0,
  fingerprint     text not null unique,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint trivia_correct_in_range check (correct_option >= 0 and correct_option < array_length(options, 1))
);
create index trivia_questions_cat_idx on public.trivia_questions (category_id, status);
create index trivia_questions_topic_idx on public.trivia_questions (topic, status) where topic is not null;
alter table public.trivia_questions enable row level security;
-- Players never read the bank directly (answers would leak). Staff review it.
create policy trivia_questions_staff on public.trivia_questions for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

create table public.question_reports (
  question_id  uuid not null references public.trivia_questions(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  reason       text check (reason is null or char_length(reason) <= 200),
  created_at   timestamptz not null default now(),
  primary key (question_id, user_id)
);
alter table public.question_reports enable row level security;
create policy question_reports_staff on public.question_reports for select to authenticated
  using (private.has_role('{admin,game_master}'));

-- Every AI call is logged for cost and quality tracking (written by the server).
create table public.ai_jobs (
  id             bigserial primary key,
  kind           text not null check (kind in ('custom', 'daily', 'admin', 'pack')),
  user_id        uuid,
  topic          text,
  category_id    uuid,
  requested      int not null default 0,
  generated      int not null default 0,
  passed         int not null default 0,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  searches       int not null default 0,
  error          text,
  created_at     timestamptz not null default now()
);
create index ai_jobs_user_idx on public.ai_jobs (user_id, created_at desc);
alter table public.ai_jobs enable row level security;
create policy ai_jobs_admin on public.ai_jobs for select to authenticated using (private.has_role('{admin}'));

-- ---------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------
create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9-]{4,20}$'),
  name            text not null check (char_length(btrim(name)) between 2 and 40),
  host_id         uuid not null references public.users(id) on delete cascade,
  mode            text not null default 'classic' check (mode in ('classic', 'speed', 'hotseat', 'pass', 'topics', 'teams')),
  category_ids    uuid[] not null default '{}',
  custom_topic    text check (custom_topic is null or char_length(custom_topic) between 3 and 60),
  question_count  smallint not null default 10 check (question_count between 3 and 30),
  seconds_per_q   smallint not null default 20 check (seconds_per_q between 5 and 60),
  status          text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  current_idx     smallint not null default -1,
  venue_id        uuid references public.venues(id) on delete set null,
  solo            boolean not null default false,
  daily_date      date,
  rematch_code    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index rooms_host_idx on public.rooms (host_id, created_at desc);
create unique index rooms_daily_uidx on public.rooms (host_id, daily_date) where daily_date is not null;

create table public.room_players (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid not null references public.rooms(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  is_guest           boolean not null default false,  -- pass-the-phone players on the host's phone
  display_name       text not null check (char_length(btrim(display_name)) between 1 and 24),
  team               char(1) check (team is null or team in ('A', 'B')),
  topic_category_id  uuid references public.trivia_categories(id) on delete set null,
  score              int not null default 0,
  correct            int not null default 0,
  wrong              int not null default 0,
  answered           int not null default 0,
  answer_ms_total    bigint not null default 0,
  joined_at          timestamptz not null default now()
);
create unique index room_players_one_per_user on public.room_players (room_id, user_id) where not is_guest;
create index room_players_user_idx on public.room_players (user_id);

create table public.room_questions (
  room_id        uuid not null references public.rooms(id) on delete cascade,
  idx            smallint not null,
  question_id    uuid not null references public.trivia_questions(id) on delete cascade,
  category_id    uuid,
  hot_player_id  uuid references public.room_players(id) on delete set null,
  started_at     timestamptz,
  locks_at       timestamptz,
  revealed_at    timestamptz,
  voided         boolean not null default false,
  primary key (room_id, idx)
);
create index room_questions_q_idx on public.room_questions (question_id);

create table public.room_answers (
  room_id      uuid not null references public.rooms(id) on delete cascade,
  idx          smallint not null,
  player_id    uuid not null references public.room_players(id) on delete cascade,
  option       smallint,
  predict      boolean,          -- hot seat: will the hot player get it right?
  answered_at  timestamptz not null default now(),
  is_correct   boolean,
  points       int not null default 0,
  primary key (room_id, idx, player_id)
);

create table public.daily_quizzes (
  quiz_date     date primary key,
  question_ids  uuid[] not null,
  created_at    timestamptz not null default now()
);

create table public.room_reactions (
  id          bigserial primary key,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  player_id   uuid not null references public.room_players(id) on delete cascade,
  emoji       text not null check (emoji in ('🔥', '😂', '😱', '👏', '🤯', '🙈', '🏏', '🎬')),
  created_at  timestamptz not null default now()
);
create index room_reactions_room_idx on public.room_reactions (room_id, created_at desc);
alter table public.room_reactions enable row level security;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_questions enable row level security;
alter table public.room_answers enable row level security;
alter table public.daily_quizzes enable row level security;
-- No policies: rooms are reached only through the functions below.

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create function private.room_by_code(p_code text)
returns public.rooms language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.rooms where code = upper(btrim(p_code));
$$;

create function private.my_player(p_room uuid)
returns public.room_players language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.room_players where room_id = p_room and user_id = auth.uid() and not is_guest;
$$;

create function private.random_code(p_prefix text default '')
returns text language sql volatile set search_path = public, extensions, pg_temp as $$
  select p_prefix || upper(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=0O1Il', ''), 1, 6));
$$;

-- Fill a room with questions: unseen first, round robin by topic for Topic wars.
create function private.fill_room(p_room uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.rooms;
  cats uuid[];
  players uuid[];
  pick uuid;
  pick_cat uuid;
  want_cat uuid;
  i int;
  n int := 0;
begin
  select * into r from public.rooms where id = p_room;
  if exists (select 1 from public.room_questions where room_id = r.id) then
    return (select count(*) from public.room_questions where room_id = r.id);
  end if;

  if r.mode = 'topics' then
    select array_agg(coalesce(topic_category_id, r.category_ids[1]) order by joined_at) into cats
      from public.room_players where room_id = r.id and not is_guest;
  end if;
  select array_agg(id order by joined_at) into players
    from public.room_players where room_id = r.id and (r.mode = 'pass' or not is_guest);

  for i in 0 .. r.question_count - 1 loop
    want_cat := case when r.mode = 'topics' and array_length(cats, 1) > 0 then cats[(i % array_length(cats, 1)) + 1] end;
    select q.id, q.category_id into pick, pick_cat
      from public.trivia_questions q
     where q.status = 'verified' and (q.expires_at is null or q.expires_at > now())
       and (case
              when r.custom_topic is not null then q.topic = lower(btrim(r.custom_topic))
              when want_cat is not null then q.category_id = want_cat
              when array_length(r.category_ids, 1) > 0 then q.category_id = any (r.category_ids)
              else true
            end)
       and not exists (select 1 from public.room_questions x where x.room_id = r.id and x.question_id = q.id)
     order by
       -- questions anyone in this room has already seen go last
       exists (select 1 from public.room_answers ra
                 join public.room_questions rq on rq.room_id = ra.room_id and rq.idx = ra.idx
                 join public.room_players rp on rp.id = ra.player_id
                where rq.question_id = q.id
                  and rp.user_id in (select user_id from public.room_players where room_id = r.id)),
       random()
     limit 1;
    -- Topic wars: fall back to any category in the room if that topic ran dry
    if pick is null and want_cat is not null then
      select q.id, q.category_id into pick, pick_cat from public.trivia_questions q
       where q.status = 'verified' and (q.expires_at is null or q.expires_at > now())
         and (array_length(r.category_ids, 1) is null or q.category_id = any (r.category_ids) or q.category_id = any (cats))
         and not exists (select 1 from public.room_questions x where x.room_id = r.id and x.question_id = q.id)
       order by random() limit 1;
    end if;
    exit when pick is null;
    insert into public.room_questions (room_id, idx, question_id, category_id, hot_player_id)
    values (r.id, n, pick, pick_cat,
            case when r.mode in ('hotseat', 'pass') and array_length(players, 1) > 0
                 then players[(n % array_length(players, 1)) + 1] end);
    n := n + 1;
    pick := null;
  end loop;
  return n;
end $$;

create function private.open_question(p_room uuid, p_idx int, p_delay interval default interval '3 seconds')
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.room_questions rq
     set started_at = now() + p_delay,
         locks_at = now() + p_delay + make_interval(secs => r.seconds_per_q)
    from public.rooms r
   where rq.room_id = p_room and rq.idx = p_idx and r.id = p_room;
  update public.rooms set current_idx = p_idx, updated_at = now() where id = p_room;
$$;

-- Score one question. Fastest right answer scores most: 100 + up to 100 for speed.
create function private.reveal_question(p_room uuid, p_idx int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.rooms;
  rq public.room_questions;
  right_opt smallint;
  hot_ok boolean;
begin
  select * into r from public.rooms where id = p_room;
  select * into rq from public.room_questions where room_id = p_room and idx = p_idx;
  select correct_option into right_opt from public.trivia_questions where id = rq.question_id;

  update public.room_answers a set is_correct = (a.option = right_opt)
   where a.room_id = p_room and a.idx = p_idx and a.option is not null;

  if r.mode = 'hotseat' then
    hot_ok := coalesce((select is_correct from public.room_answers
                         where room_id = p_room and idx = p_idx and player_id = rq.hot_player_id), false);
    update public.room_answers a
       set is_correct = case when a.player_id = rq.hot_player_id then a.is_correct else (a.predict = hot_ok) end,
           points = case when a.player_id = rq.hot_player_id then (case when hot_ok then 200 else 0 end)
                         when a.predict = hot_ok then 50 else 0 end
     where a.room_id = p_room and a.idx = p_idx;
  else
    update public.room_answers a
       set points = case when a.is_correct
                         then 100 + floor(100 * greatest(0, extract(epoch from (rq.started_at + make_interval(secs => r.seconds_per_q) - a.answered_at)))
                                      / r.seconds_per_q)::int
                         else 0 end
     where a.room_id = p_room and a.idx = p_idx;
  end if;

  update public.room_players p
     set score = p.score + a.points,
         correct = p.correct + (case when a.is_correct then 1 else 0 end),
         wrong = p.wrong + (case when a.is_correct is false then 1 else 0 end),
         answered = p.answered + 1,
         answer_ms_total = p.answer_ms_total + greatest(0, (extract(epoch from (a.answered_at - rq.started_at)) * 1000)::bigint)
    from public.room_answers a
   where a.room_id = p_room and a.idx = p_idx and a.player_id = p.id;

  update public.room_questions set revealed_at = now(), locks_at = least(locks_at, now())
   where room_id = p_room and idx = p_idx;
  update public.trivia_questions set times_used = times_used + 1 where id = rq.question_id;
end $$;

-- The whole room as the caller should see it. Answers only after reveal.
create function private.room_state(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r public.rooms;
  rq public.room_questions;
  q public.trivia_questions;
  me public.room_players;
  out jsonb;
  cur jsonb := null;
  total int;
begin
  select * into r from public.rooms where id = p_room;
  select * into me from public.room_players where room_id = p_room and user_id = auth.uid() and not is_guest;
  select count(*) into total from public.room_questions where room_id = p_room;

  if r.status in ('playing', 'finished') and r.current_idx >= 0 then
    select * into rq from public.room_questions where room_id = p_room and idx = r.current_idx;
    select * into q from public.trivia_questions where id = rq.question_id;
    cur := jsonb_build_object(
      'idx', rq.idx,
      'prompt', q.prompt,
      'options', to_jsonb(q.options),
      'category', (select jsonb_build_object('name', c.name, 'emoji', c.emoji, 'sponsor',
                      (select jsonb_build_object('name', s.name, 'logo_url', s.logo_url, 'tagline', s.tagline)
                         from public.sponsors s where s.id = c.sponsor_id and s.is_active))
                     from public.trivia_categories c where c.id = rq.category_id),
      'started_at', rq.started_at,
      'locks_at', rq.locks_at,
      'revealed', rq.revealed_at is not null,
      'revealed_at', rq.revealed_at,
      'voided', rq.voided,
      'hot_player_id', rq.hot_player_id,
      'answers', (select count(*) from public.room_answers where room_id = p_room and idx = rq.idx),
      'mine', (select jsonb_agg(jsonb_build_object('player_id', a.player_id, 'option', a.option, 'predict', a.predict,
                                                   'is_correct', case when rq.revealed_at is not null then a.is_correct end,
                                                   'points', case when rq.revealed_at is not null then a.points end))
                 from public.room_answers a join public.room_players p on p.id = a.player_id
                where a.room_id = p_room and a.idx = rq.idx and p.user_id = auth.uid()),
      'correct_option', case when rq.revealed_at is not null then q.correct_option end,
      'explanation', case when rq.revealed_at is not null then q.explanation end,
      'source_url', case when rq.revealed_at is not null then q.source_url end,
      'source_title', case when rq.revealed_at is not null then q.source_title end,
      'ai', q.origin = 'ai',
      'split', case when rq.revealed_at is not null then
                 (select jsonb_agg(coalesce((select count(*) from public.room_answers a
                                              where a.room_id = p_room and a.idx = rq.idx and a.option = o.i - 1), 0) order by o.i)
                    from generate_subscripts(q.options, 1) as o(i)) end
    );
  end if;

  select jsonb_build_object(
    'server_now', now(),
    'code', r.code,
    'name', r.name,
    'mode', r.mode,
    'status', r.status,
    'solo', r.solo,
    'daily', r.daily_date is not null,
    'seconds', r.seconds_per_q,
    'count', greatest(total, r.question_count),
    'total', total,
    'idx', r.current_idx,
    'is_host', r.host_id = auth.uid(),
    'me', me.id,
    'custom_topic', r.custom_topic,
    'rematch_code', r.rematch_code,
    'venue', (select name from public.venues where id = r.venue_id),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'emoji', c.emoji) order by c.sort_order)
                              from public.trivia_categories c where c.id = any (r.category_ids)), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'name', p.display_name, 'team', p.team, 'score', p.score, 'correct', p.correct,
                  'wrong', p.wrong, 'answered', p.answered,
                  'avg_ms', case when p.answered > 0 then p.answer_ms_total / p.answered end,
                  'is_me', p.user_id = auth.uid() and not p.is_guest, 'is_guest', p.is_guest,
                  'is_host', p.user_id = r.host_id and not p.is_guest,
                  'topic', p.topic_category_id) order by p.score desc, p.joined_at)
                from public.room_players p where p.room_id = p_room), '[]'::jsonb),
    'current', cur,
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'emoji', x.emoji, 'name', p.display_name) order by x.id)
                             from (select * from public.room_reactions where room_id = p_room and created_at > now() - interval '6 seconds'
                                    order by id desc limit 12) x
                             join public.room_players p on p.id = x.player_id), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- ---------------------------------------------------------------------
-- Player functions
-- ---------------------------------------------------------------------
create function public.room_code_available(p_code text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select upper(btrim(p_code)) ~ '^[A-Z0-9-]{4,20}$'
     and not exists (select 1 from public.rooms where code = upper(btrim(p_code)));
$$;

create function public.create_room(
  p_name text, p_code text, p_mode text, p_category_ids uuid[], p_custom_topic text,
  p_count int, p_seconds int, p_venue_slug text default null, p_guests text[] default '{}'
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.users;
  c text := upper(btrim(coalesce(p_code, '')));
  rid uuid;
  g text;
  topic text := nullif(btrim(coalesce(p_custom_topic, '')), '');
begin
  u := private.require_player();
  if (select count(*) from public.rooms where host_id = u.id and created_at > now() - interval '1 day' and daily_date is null) >= 40 then
    raise exception 'too_many_rooms';
  end if;
  if p_mode not in ('classic', 'speed', 'hotseat', 'pass', 'topics', 'teams') then raise exception 'invalid_mode'; end if;
  if topic is null and coalesce(array_length(p_category_ids, 1), 0) = 0 then raise exception 'pick_a_category'; end if;
  if topic is not null and char_length(topic) not between 3 and 60 then raise exception 'topic_length'; end if;
  if p_mode = 'pass' and coalesce(array_length(p_guests, 1), 0) < 1 then raise exception 'add_players'; end if;
  if c = '' then
    loop
      c := private.random_code('');
      exit when not exists (select 1 from public.rooms where code = c);
    end loop;
  elsif not public.room_code_available(c) then
    raise exception 'code_taken';
  end if;

  insert into public.rooms (code, name, host_id, mode, category_ids, custom_topic, question_count, seconds_per_q, venue_id)
  values (c, btrim(coalesce(nullif(p_name, ''), u.display_name || '''s room')), u.id, p_mode,
          coalesce(p_category_ids, '{}'), topic,
          least(greatest(coalesce(p_count, 10), 3), 30),
          case when p_mode = 'speed' then 5 else least(greatest(coalesce(p_seconds, 20), 10), 60) end,
          (select id from public.venues where slug = lower(p_venue_slug) and is_active))
  returning id into rid;

  insert into public.room_players (room_id, user_id, display_name, team)
  values (rid, u.id, u.display_name, case when p_mode = 'teams' then 'A' end);

  if p_mode = 'pass' then
    foreach g in array p_guests loop
      if char_length(btrim(g)) between 1 and 24 then
        insert into public.room_players (room_id, user_id, is_guest, display_name) values (rid, u.id, true, btrim(g));
      end if;
    end loop;
  end if;
  return c;
end $$;

create function public.room_preview(p_code text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('code', r.code, 'name', r.name, 'mode', r.mode, 'status', r.status,
           'host', (select display_name from public.users where id = r.host_id),
           'players', (select count(*) from public.room_players where room_id = r.id),
           'custom_topic', r.custom_topic,
           'categories', coalesce((select jsonb_agg(c.name) from public.trivia_categories c where c.id = any (r.category_ids)), '[]'::jsonb))
    from public.rooms r where r.code = upper(btrim(p_code)) and not r.solo;
$$;

create function public.join_room(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.users;
  r public.rooms;
  n_a int; n_b int;
begin
  u := private.require_player();
  r := private.room_by_code(p_code);
  if r.id is not null and exists (select 1 from public.room_players where room_id = r.id and user_id = u.id) then
    return private.room_state(r.id);
  end if;
  if r.id is null or r.solo then raise exception 'room_not_found'; end if;
  if r.status = 'finished' then raise exception 'room_finished'; end if;
  if r.mode = 'pass' then raise exception 'pass_mode_one_phone'; end if;
  if (select count(*) from public.room_players where room_id = r.id) >= 30 then raise exception 'room_full'; end if;
  select count(*) filter (where team = 'A'), count(*) filter (where team = 'B') into n_a, n_b
    from public.room_players where room_id = r.id;
  insert into public.room_players (room_id, user_id, display_name, team)
  values (r.id, u.id, u.display_name, case when r.mode = 'teams' then (case when n_a <= n_b then 'A' else 'B' end) end);
  update public.rooms set updated_at = now() where id = r.id;
  return private.room_state(r.id);
end $$;

create function public.set_room_team(p_code text, p_player uuid, p_team text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rooms;
begin
  perform private.require_player();
  r := private.room_by_code(p_code);
  if r.id is null or r.status <> 'lobby' or r.mode <> 'teams' then raise exception 'cannot_change'; end if;
  -- the host can move anyone; players can move themselves
  if r.host_id <> auth.uid() and not exists (select 1 from public.room_players where id = p_player and user_id = auth.uid() and not is_guest) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.room_players set team = case when p_team in ('A', 'B') then p_team end where id = p_player and room_id = r.id;
end $$;

create function public.set_my_topic(p_code text, p_category uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rooms;
begin
  perform private.require_player();
  r := private.room_by_code(p_code);
  if r.id is null or r.status <> 'lobby' or r.mode <> 'topics' then raise exception 'cannot_change'; end if;
  if not exists (select 1 from public.trivia_categories where id = p_category and is_active) then raise exception 'pick_a_category'; end if;
  update public.room_players set topic_category_id = p_category where room_id = r.id and user_id = auth.uid() and not is_guest;
end $$;

create function public.start_room(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.rooms;
  n int;
begin
  perform private.require_player();
  select * into r from public.rooms where code = upper(btrim(p_code)) for update;
  if r.id is null then raise exception 'room_not_found'; end if;
  if r.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if r.status <> 'lobby' then return private.room_state(r.id); end if;
  if r.mode = 'teams' and (select count(distinct team) from public.room_players where room_id = r.id) < 2 then
    raise exception 'teams_need_players';
  end if;
  n := private.fill_room(r.id);
  if n < 3 then raise exception 'not_enough_questions'; end if;
  update public.rooms set status = 'playing', question_count = n, updated_at = now() where id = r.id;
  perform private.open_question(r.id, 0);
  return private.room_state(r.id);
end $$;

-- Called by every phone about once a second: moves the game along when due,
-- then returns the current state. Whoever arrives first does the work.
create function public.room_tick(p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.rooms;
  rq public.room_questions;
  expected int;
  answered int;
  total int;
begin
  perform private.require_player();
  select * into r from public.rooms where code = upper(btrim(p_code)) for update skip locked;
  if r.id is null then
    r := private.room_by_code(p_code);
    if r.id is null then raise exception 'room_not_found'; end if;
  elsif r.status = 'playing' then
    select * into rq from public.room_questions where room_id = r.id and idx = r.current_idx;
    if rq.revealed_at is null then
      expected := case when r.mode = 'pass' then 1
                       else (select count(*) from public.room_players where room_id = r.id and not is_guest) end;
      select count(*) into answered from public.room_answers where room_id = r.id and idx = r.current_idx;
      if now() >= rq.locks_at or (now() >= rq.started_at and answered >= expected) then
        perform private.reveal_question(r.id, r.current_idx);
      end if;
    elsif now() >= rq.revealed_at + interval '5 seconds' then
      select count(*) into total from public.room_questions where room_id = r.id;
      if r.current_idx + 1 >= total then
        update public.rooms set status = 'finished', finished_at = now(), updated_at = now() where id = r.id;
      else
        perform private.open_question(r.id, r.current_idx + 1, interval '1 second');
      end if;
    end if;
  end if;
  if not exists (select 1 from public.room_players where room_id = r.id and user_id = auth.uid()) then
    raise exception 'not_in_room';
  end if;
  return private.room_state(r.id);
end $$;

create function public.room_answer(p_code text, p_option smallint default null, p_player uuid default null, p_predict boolean default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.rooms;
  rq public.room_questions;
  p public.room_players;
  n_opts int;
  inserted int;
begin
  perform private.require_player();
  r := private.room_by_code(p_code);
  if r.id is null then raise exception 'room_not_found'; end if;
  select * into rq from public.room_questions where room_id = r.id and idx = r.current_idx;
  if r.status <> 'playing' or rq.revealed_at is not null or now() < rq.started_at or now() >= rq.locks_at then
    raise exception 'question_closed';
  end if;

  if p_player is null then
    select * into p from public.room_players where room_id = r.id and user_id = auth.uid() and not is_guest;
  else
    select * into p from public.room_players where id = p_player and room_id = r.id and user_id = auth.uid();
  end if;
  if p.id is null then raise exception 'not_in_room'; end if;

  select array_length(options, 1) into n_opts from public.trivia_questions where id = rq.question_id;
  if r.mode = 'pass' and p.id <> rq.hot_player_id then raise exception 'not_your_turn'; end if;
  if r.mode = 'hotseat' and p.id = rq.hot_player_id then
    if p_option is null then raise exception 'invalid_option'; end if;
  elsif r.mode = 'hotseat' then
    if p_predict is null then raise exception 'invalid_option'; end if;
  elsif p_option is null then
    raise exception 'invalid_option';
  end if;
  if p_option is not null and (p_option < 0 or p_option >= n_opts) then raise exception 'invalid_option'; end if;

  insert into public.room_answers (room_id, idx, player_id, option, predict)
  values (r.id, r.current_idx, p.id,
          case when r.mode = 'hotseat' and p.id <> rq.hot_player_id then null else p_option end,
          case when r.mode = 'hotseat' and p.id <> rq.hot_player_id then p_predict end)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then raise exception 'already_answered'; end if;
end $$;

create function public.rematch_room(p_code text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.rooms;
  c text;
  rid uuid;
begin
  perform private.require_player();
  select * into r from public.rooms where code = upper(btrim(p_code)) for update;
  if r.id is null or r.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if r.rematch_code is not null then return r.rematch_code; end if;
  loop
    c := left(regexp_replace(r.code, '-R[0-9A-Z]{2}$', ''), 15) || '-R' || substr(private.random_code(''), 1, 2);
    exit when not exists (select 1 from public.rooms where code = c);
  end loop;
  insert into public.rooms (code, name, host_id, mode, category_ids, custom_topic, question_count, seconds_per_q, venue_id)
  values (c, r.name, r.host_id, r.mode, r.category_ids, r.custom_topic,
          (select greatest(count(*), 3) from public.room_questions where room_id = r.id), r.seconds_per_q, r.venue_id)
  returning id into rid;
  -- the host, and in pass mode the same guests, carry over; teams keep their sides
  insert into public.room_players (room_id, user_id, is_guest, display_name, team, topic_category_id)
  select rid, user_id, is_guest, display_name, team, topic_category_id
    from public.room_players where room_id = r.id and (user_id = r.host_id);
  update public.rooms set rematch_code = c where id = r.id;
  return c;
end $$;

create function public.report_question(p_code text, p_idx int, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.rooms;
  rq public.room_questions;
  n int;
  pulled boolean := false;
begin
  perform private.require_player();
  r := private.room_by_code(p_code);
  if r.id is null or not exists (select 1 from public.room_players where room_id = r.id and user_id = auth.uid()) then
    raise exception 'not_in_room';
  end if;
  select * into rq from public.room_questions where room_id = r.id and idx = p_idx;
  if rq.revealed_at is null then raise exception 'question_closed'; end if;

  insert into public.question_reports (question_id, user_id, reason)
  values (rq.question_id, auth.uid(), left(p_reason, 200)) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    update public.trivia_questions set reports = reports + 1 where id = rq.question_id returning reports into n;
    -- Two reports: pull the question everywhere and take its points back out,
    -- so a wrong answer key never decides a game.
    if n >= 2 then
      update public.trivia_questions set status = 'pulled' where id = rq.question_id and status = 'verified';
      update public.room_players p
         set score = p.score - a.points,
             correct = p.correct - (case when a.is_correct then 1 else 0 end),
             wrong = p.wrong - (case when a.is_correct is false then 1 else 0 end)
        from public.room_answers a
        join public.room_questions x on x.room_id = a.room_id and x.idx = a.idx
       where x.question_id = rq.question_id and not x.voided and a.player_id = p.id;
      update public.room_answers a set points = 0
        from public.room_questions x
       where x.room_id = a.room_id and x.idx = a.idx and x.question_id = rq.question_id;
      update public.room_questions set voided = true where question_id = rq.question_id;
      pulled := true;
    end if;
  end if;
  return jsonb_build_object('reported', true, 'pulled', pulled);
end $$;

create function public.room_react(p_code text, p_emoji text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rooms; p public.room_players;
begin
  perform private.require_player();
  r := private.room_by_code(p_code);
  select * into p from public.room_players where room_id = r.id and user_id = auth.uid() and not is_guest;
  if p.id is null then raise exception 'not_in_room'; end if;
  -- at most 3 a second per player, so a room can't be flooded
  if (select count(*) from public.room_reactions where player_id = p.id and created_at > now() - interval '1 second') >= 3 then return; end if;
  insert into public.room_reactions (room_id, player_id, emoji) values (r.id, p.id, p_emoji);
end $$;

-- ---------------------------------------------------------------------
-- Solo: the daily quiz (same 10 questions for everyone each day, IST)
-- ---------------------------------------------------------------------
create function public.start_daily()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u public.users;
  d date := (now() at time zone 'Asia/Kolkata')::date;
  ids uuid[];
  existing text;
  c text;
  rid uuid;
  pid uuid;
  i int;
begin
  u := private.require_player();
  select code into existing from public.rooms where host_id = u.id and daily_date = d;
  if existing is not null then return existing; end if;

  select question_ids into ids from public.daily_quizzes where quiz_date = d;
  if ids is null then
    -- 3 cricket/sports, 3 Bollywood, 2 general, 2 current affairs, topped up from anything verified
    with pool as (
      select q.id, c.kind, row_number() over (partition by c.kind order by random()) as rn
        from public.trivia_questions q join public.trivia_categories c on c.id = q.category_id
       where q.status = 'verified' and q.topic is null and (q.expires_at is null or q.expires_at > now())
    ),
    pick as (
      select id from pool where (kind = 'sports' and rn <= 3) or (kind = 'bollywood' and rn <= 3)
                             or (kind = 'general' and rn <= 2) or (kind = 'current' and rn <= 2)
    )
    select array_agg(id) into ids from (
      select id from pick
      union all
      select id from (select id from pool where id not in (select id from pick) order by random()
                       limit greatest(0, 10 - (select count(*) from pick))) t
    ) x;
    if coalesce(array_length(ids, 1), 0) < 3 then raise exception 'not_enough_questions'; end if;
    insert into public.daily_quizzes (quiz_date, question_ids) values (d, ids) on conflict do nothing;
    select question_ids into ids from public.daily_quizzes where quiz_date = d;
  end if;

  loop
    c := private.random_code('DAY-');
    exit when not exists (select 1 from public.rooms where code = c);
  end loop;
  insert into public.rooms (code, name, host_id, mode, question_count, seconds_per_q, status, solo, daily_date)
  values (c, 'Daily quiz', u.id, 'classic', array_length(ids, 1), 20, 'playing', true, d)
  returning id into rid;
  insert into public.room_players (room_id, user_id, display_name) values (rid, u.id, u.display_name) returning id into pid;
  for i in 1 .. array_length(ids, 1) loop
    insert into public.room_questions (room_id, idx, question_id, category_id)
    select rid, i - 1, ids[i], category_id from public.trivia_questions where id = ids[i];
  end loop;
  perform private.open_question(rid, 0);
  return c;
end $$;

create function public.my_play_profile()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date := (now() at time zone 'Asia/Kolkata')::date;
  streak int := 0;
  best int := 0;
  run int := 0;
  prev date := null;
  x record;
begin
  perform private.require_player();
  -- consecutive days with a finished daily quiz, ending today or yesterday
  for x in select daily_date from public.rooms where host_id = auth.uid() and daily_date is not null and status = 'finished' order by daily_date loop
    run := case when prev is not null and x.daily_date = prev + 1 then run + 1 else 1 end;
    best := greatest(best, run);
    prev := x.daily_date;
  end loop;
  streak := case when prev >= d - 1 then run else 0 end;

  return jsonb_build_object(
    'streak', streak,
    'best_streak', best,
    'today', (select jsonb_build_object('code', r.code, 'status', r.status, 'score', p.score, 'correct', p.correct, 'total', r.question_count)
                from public.rooms r join public.room_players p on p.room_id = r.id and p.user_id = auth.uid()
               where r.host_id = auth.uid() and r.daily_date = d),
    'rooms_played', (select count(*) from public.room_players p join public.rooms r on r.id = p.room_id
                      where p.user_id = auth.uid() and not p.is_guest and not r.solo and r.status = 'finished'),
    'wins', (select count(*) from public.rooms r
              where r.status = 'finished' and not r.solo and r.mode <> 'pass'
                and (select user_id from public.room_players where room_id = r.id order by score desc, joined_at limit 1) = auth.uid()
                and (select count(*) from public.room_players where room_id = r.id) > 1),
    'recent', coalesce((select jsonb_agg(t order by t->>'at' desc) from (
                 select jsonb_build_object('code', r.code, 'name', r.name, 'mode', r.mode, 'status', r.status, 'at', r.updated_at,
                          'players', (select count(*) from public.room_players where room_id = r.id)) as t
                   from public.rooms r
                  where not r.solo and exists (select 1 from public.room_players p where p.room_id = r.id and p.user_id = auth.uid())
                  order by r.updated_at desc limit 8) s), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- Staff: bank health per category
-- ---------------------------------------------------------------------
create function public.trivia_bank_stats()
returns table (category_id uuid, name text, verified bigint, pending bigint, rejected bigint, pulled bigint,
               reported bigint, plays bigint, expiring bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.name,
         count(q.id) filter (where q.status = 'verified' and (q.expires_at is null or q.expires_at > now())),
         count(q.id) filter (where q.status = 'pending'),
         count(q.id) filter (where q.status = 'rejected'),
         count(q.id) filter (where q.status = 'pulled'),
         count(q.id) filter (where q.reports > 0 and q.status = 'verified'),
         coalesce(sum(q.times_used), 0),
         count(q.id) filter (where q.status = 'verified' and q.expires_at between now() and now() + interval '2 days')
    from public.trivia_categories c
    left join public.trivia_questions q on q.category_id = c.id and q.topic is null
   where private.has_role('{admin,game_master}')
   group by c.id, c.name, c.sort_order
   order by c.sort_order;
$$;

-- ---------------------------------------------------------------------
-- Audit and privileges
-- ---------------------------------------------------------------------
create trigger trivia_categories_audit after insert or update or delete on public.trivia_categories
  for each row execute function private.audit_generic();

revoke execute on function
  public.room_code_available(text),
  public.create_room(text, text, text, uuid[], text, int, int, text, text[]),
  public.room_preview(text),
  public.join_room(text),
  public.set_room_team(text, uuid, text),
  public.set_my_topic(text, uuid),
  public.start_room(text),
  public.room_tick(text),
  public.room_answer(text, smallint, uuid, boolean),
  public.rematch_room(text),
  public.report_question(text, int, text),
  public.room_react(text, text),
  public.start_daily(),
  public.my_play_profile(),
  public.trivia_bank_stats()
from public, anon;

grant execute on function
  public.room_code_available(text),
  public.create_room(text, text, text, uuid[], text, int, int, text, text[]),
  public.room_preview(text),
  public.join_room(text),
  public.set_room_team(text, uuid, text),
  public.set_my_topic(text, uuid),
  public.start_room(text),
  public.room_tick(text),
  public.room_answer(text, smallint, uuid, boolean),
  public.rematch_room(text),
  public.report_question(text, int, text),
  public.room_react(text, text),
  public.start_daily(),
  public.my_play_profile(),
  public.trivia_bank_stats()
to authenticated;
grant execute on function public.room_preview(text) to anon;
