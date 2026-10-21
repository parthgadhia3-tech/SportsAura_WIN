-- =====================================================================
-- 1. TV QR check-in (30-second rotating code, no permission prompt)
-- 2. A player can win the same reward only once per match
-- 3. Player record (lifetime stats + match history)
-- =====================================================================

alter type public.verify_method add value if not exists 'qr';

-- A scan of the TV QR is exchanged immediately for a single-use ticket, so a
-- new player has time to log in (OTP) after scanning. Tickets live 15 minutes.
create table public.presence_tickets (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '15 minutes',
  used_by     uuid references public.users(id) on delete set null,
  used_at     timestamptz
);
create index presence_tickets_expiry_idx on public.presence_tickets (expires_at);
alter table public.presence_tickets enable row level security;   -- no policies: RPC only

-- QR window = 30 seconds. Codes from the current and previous window are
-- accepted, so a code lives 30 to 60 seconds.
create function private.qr_window(p_at timestamptz default now())
returns bigint language sql stable as $$
  select floor(extract(epoch from p_at) / 30)::bigint;
$$;

create function private.venue_qr_code(p_venue uuid, p_window bigint)
returns text language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select substr(encode(hmac(convert_to('qr:' || p_window::text, 'UTF8'), s.pin_secret, 'sha256'), 'hex'), 1, 16)
  from public.venue_secrets s where s.venue_id = p_venue;
$$;
revoke execute on function private.qr_window(timestamptz), private.venue_qr_code(uuid, bigint) from public, anon, authenticated;

-- Called the moment the QR is scanned (before login, so anon can call it).
create function public.claim_qr_ticket(p_venue_slug text, p_code text)
returns table (ticket uuid, venue_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v uuid;
  w bigint := private.qr_window();
  t public.presence_tickets;
begin
  select id into v from public.venues where slug = lower(p_venue_slug) and is_active;
  if v is null or p_code is null or p_code !~ '^[0-9a-f]{16}$' then return; end if;
  if p_code <> private.venue_qr_code(v, w) and p_code <> private.venue_qr_code(v, w - 1) then return; end if;

  insert into public.presence_tickets (venue_id) values (v) returning * into t;
  return query select t.id, t.venue_id, t.expires_at;
end $$;

create function public.verify_presence_qr(p_ticket uuid, p_match_id uuid)
returns table (ok boolean, session_id uuid, reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t public.presence_tickets;
  sid uuid;
begin
  perform private.require_player();
  select * into t from public.presence_tickets where id = p_ticket for update;
  if not found or t.used_at is not null or t.expires_at < now() then
    return query select false, null::uuid, 'qr_expired'; return;
  end if;
  if not exists (select 1 from public.matches where id = p_match_id and status = 'live') then
    return query select false, null::uuid, 'match_not_live'; return;
  end if;

  update public.presence_tickets set used_by = auth.uid(), used_at = now() where id = t.id;

  insert into public.player_sessions as s (user_id, venue_id, match_id, verification_method, distance_m)
  values (auth.uid(), t.venue_id, p_match_id, 'qr', null)
  on conflict (user_id, match_id) do update set
    venue_id = excluded.venue_id, verification_method = 'qr', distance_m = null,
    verified_at = now(), last_seen_at = now(), needs_reverify = false
  returning s.id into sid;

  return query select true, sid, null::text;
end $$;

-- For the TV screen: current code and when it changes.
create function public.current_venue_qr(p_venue_id uuid)
returns table (code text, valid_until timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare w bigint := private.qr_window();
begin
  if not private.manages_venue(p_venue_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select private.venue_qr_code(p_venue_id, w), to_timestamp((w + 1) * 30);
end $$;

-- ---------------------------------------------------------------------
-- Same reward at most once per player per match
-- ---------------------------------------------------------------------
create or replace function public.resolve_question(p_question_id uuid, p_correct_option smallint)
returns table (correct_count int, coupons_issued int)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  q public.questions;
  b public.coupon_buckets;
  sec public.coupon_bucket_secrets;
  n_correct int := 0;
  n_issued int := 0;
  remaining int;
begin
  perform private.require_role('{admin,game_master}');
  select * into q from public.questions where id = p_question_id for update;
  if not found or q.status not in ('live', 'locked') then raise exception 'cannot_resolve'; end if;
  if p_correct_option < 0 or p_correct_option >= array_length(q.options, 1) then raise exception 'invalid_option'; end if;

  update public.questions
     set status = 'resolved', correct_option = p_correct_option,
         locks_at = least(locks_at, now()), resolved_at = now()
   where id = q.id;

  update public.answers
     set is_correct = (selected_option = p_correct_option),
         points_awarded = case when selected_option = p_correct_option then q.points else 0 end
   where question_id = q.id;

  update public.player_sessions s
     set points_total = s.points_total + q.points
    from public.answers a
   where a.question_id = q.id and a.is_correct and a.session_id = s.id;
  get diagnostics n_correct = row_count;

  if q.coupon_bucket_id is not null then
    select * into b from public.coupon_buckets
     where id = q.coupon_bucket_id and is_active and (valid_until is null or valid_until > now())
     for update;
    if found then
      select * into sec from public.coupon_bucket_secrets where bucket_id = b.id;
      remaining := case when b.total_quantity is null then null
                        else greatest(b.total_quantity - b.issued_count, 0) end;

      insert into public.user_coupons (bucket_id, user_id, question_id, venue_id, code, expires_at)
      select b.id, w.user_id, q.id, w.venue_id,
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
             and (b.min_age = 21 or u.age_verified_25)            -- spirits rewards: 25+ only
             and not exists (                                     -- same reward once per match
               select 1 from public.user_coupons uc
                 join public.questions q2 on q2.id = uc.question_id
                where uc.user_id = a.user_id and uc.bucket_id = b.id and q2.match_id = q.match_id)
           order by a.answered_at                                 -- fastest correct answers first
           limit remaining
        ) w
      on conflict do nothing;
      get diagnostics n_issued = row_count;

      update public.coupon_buckets set issued_count = issued_count + n_issued where id = b.id;
    end if;
  end if;

  return query select n_correct, n_issued;
end $$;

-- ---------------------------------------------------------------------
-- Player record: everything a returning player should see again
-- ---------------------------------------------------------------------
create function public.my_record()
returns table (
  matches_played int, total_points int, predictions int, correct int,
  rewards_won int, best_finish bigint, member_since timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select * from public.users where id = auth.uid() and deleted_at is null),
  finishes as (
    select s.user_id,
           rank() over (partition by s.match_id, s.venue_id order by s.points_total desc) as r
      from public.player_sessions s
     where s.match_id in (select match_id from public.player_sessions where user_id = auth.uid())
  )
  select
    (select count(*)::int from public.player_sessions where user_id = auth.uid()),
    (select coalesce(sum(points_total), 0)::int from public.player_sessions where user_id = auth.uid()),
    (select count(*)::int from public.answers where user_id = auth.uid()),
    (select count(*)::int from public.answers where user_id = auth.uid() and is_correct),
    (select count(*)::int from public.user_coupons where user_id = auth.uid()),
    (select min(r) from finishes where user_id = auth.uid()),
    me.created_at
  from me;
$$;

create function public.my_match_history(p_limit int default 30)
returns table (
  match_id uuid, match_title text, played_at timestamptz, venue_name text,
  points int, finish bigint, players bigint, correct int, predictions int
)
language sql stable security definer set search_path = public, pg_temp as $$
  with mine as (
    select s.* from public.player_sessions s where s.user_id = auth.uid()
  ),
  ranked as (
    select s.match_id, s.venue_id, s.user_id,
           rank() over (partition by s.match_id, s.venue_id order by s.points_total desc) as finish,
           count(*) over (partition by s.match_id, s.venue_id) as players
      from public.player_sessions s
     where (s.match_id, s.venue_id) in (select match_id, venue_id from mine)
  )
  select m.id, m.title, mine.verified_at, v.name, mine.points_total, r.finish, r.players,
         (select count(*)::int from public.answers a where a.session_id = mine.id and a.is_correct),
         (select count(*)::int from public.answers a where a.session_id = mine.id)
    from mine
    join public.matches m on m.id = mine.match_id
    join public.venues v on v.id = mine.venue_id
    join ranked r on r.match_id = mine.match_id and r.venue_id = mine.venue_id and r.user_id = mine.user_id
   order by mine.verified_at desc
   limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke execute on function
  public.claim_qr_ticket(text, text),
  public.verify_presence_qr(uuid, uuid),
  public.current_venue_qr(uuid),
  public.my_record(),
  public.my_match_history(int)
from public, anon;

grant execute on function public.claim_qr_ticket(text, text) to anon, authenticated;
grant execute on function
  public.verify_presence_qr(uuid, uuid),
  public.current_venue_qr(uuid),
  public.my_record(),
  public.my_match_history(int)
to authenticated;

-- Fixed search paths for small helpers (Supabase security advisor)
alter function private.session_active(public.player_sessions) set search_path = public, pg_temp;
alter function private.pin_window(timestamptz) set search_path = public, pg_temp;
alter function private.qr_window(timestamptz) set search_path = public, pg_temp;
