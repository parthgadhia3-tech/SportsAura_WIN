-- =====================================================================
-- MatchDay: live prediction & loyalty platform
-- Initial schema. Run on Supabase (PostgreSQL 15+, PostGIS available).
-- Vocabulary rule: Predict / Points / Rewards only.
-- =====================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live in a schema that is NOT exposed through the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.bg_type         as enum ('solid', 'gradient', 'image');
create type public.match_status    as enum ('scheduled', 'live', 'ended');
create type public.question_status as enum ('draft', 'live', 'locked', 'resolved', 'void');
create type public.verify_method   as enum ('gps', 'pin');
create type public.staff_role      as enum ('admin', 'game_master', 'venue_manager');
create type public.code_mode       as enum ('none', 'static', 'unique');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- Patron profile. Phone number + OTP live in auth.users (Supabase Auth).
create table public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  display_name          text not null check (char_length(btrim(display_name)) between 2 and 24),
  age_verified_21       boolean not null check (age_verified_21),      -- must be true to exist
  age_verified_25       boolean not null default false,                -- unlocks spirits rewards
  consent_agreed_at     timestamptz not null,                          -- T&C + DPDP notice
  location_consent_at   timestamptz not null,                          -- presence verification
  marketing_consent_at  timestamptz,                                   -- optional, separate
  terms_version         text not null,
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table public.themes (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  bg_type          public.bg_type not null default 'solid',
  bg_value         text not null default '#0C2427',
  primary_color    text not null default '#FFB020' check (primary_color   ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color  text not null default '#7FE0C8' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color       text not null default '#F3F1E8' check (text_color      ~ '^#[0-9A-Fa-f]{6}$'),
  surface_color    text not null default '#123236' check (surface_color   ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url         text check (logo_url is null or logo_url ~ '^https://'),
  sponsor_name     text,
  created_at       timestamptz not null default now(),
  -- background values are rendered into CSS, so they are validated strictly
  constraint themes_bg_value_valid check (
    case bg_type
      when 'solid'    then bg_value ~ '^#[0-9A-Fa-f]{6}$'
      when 'gradient' then bg_value ~ '^(linear|radial)-gradient\([#%,.()a-zA-Z0-9 -]+\)$'
      when 'image'    then bg_value ~ '^https://[^\s"''()<>]+$'
    end
  )
);

create table public.venues (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  address            text,
  city               text not null default 'Mumbai',
  location           extensions.geography(Point, 4326) not null,
  geofence_radius_m  int not null default 150 check (geofence_radius_m between 30 and 500),
  default_theme_id   uuid references public.themes(id) on delete set null,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
create index venues_location_gix on public.venues using gist (location);

-- Per-venue secret used to derive the rotating 4-digit PIN (TOTP-style).
-- Nobody can read this table through the API.
create table public.venue_secrets (
  venue_id    uuid primary key references public.venues(id) on delete cascade,
  pin_secret  bytea not null default extensions.gen_random_bytes(32)
);

create table public.staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        public.staff_role not null,
  venue_id    uuid references public.venues(id) on delete cascade,
  name        text,
  created_at  timestamptz not null default now(),
  constraint staff_venue_manager_has_venue check (role <> 'venue_manager' or venue_id is not null)
);

create table public.matches (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  sport       text not null default 'cricket',
  starts_at   timestamptz not null,
  status      public.match_status not null default 'scheduled',
  theme_id    uuid references public.themes(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.player_sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  venue_id             uuid not null references public.venues(id) on delete cascade,
  match_id             uuid not null references public.matches(id) on delete cascade,
  verification_method  public.verify_method not null,
  distance_m           numeric(7,1),            -- result only. Raw coordinates are never stored.
  verified_at          timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  needs_reverify       boolean not null default false,
  points_total         int not null default 0,
  unique (user_id, match_id)
);
create index player_sessions_venue_match_idx on public.player_sessions (venue_id, match_id, points_total desc);

create table public.coupon_buckets (
  id              uuid primary key default gen_random_uuid(),
  brand_name      text not null,
  logo_url        text check (logo_url is null or logo_url ~ '^https://'),
  title           text not null,                 -- e.g. "20% off your next pint"
  description     text,
  terms           text,
  is_alcohol      boolean not null default false,
  min_age         smallint not null default 21 check (min_age in (21, 25)),
  code_mode       public.code_mode not null default 'none',
  total_quantity  int check (total_quantity is null or total_quantity > 0),
  issued_count    int not null default 0,
  valid_until     timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint buckets_spirits_need_alcohol_flag check (min_age = 21 or is_alcohol)
);

-- Affiliate URL and static promo code are hidden from patrons so the
-- click tracker cannot be bypassed and codes are only revealed on a win.
create table public.coupon_bucket_secrets (
  bucket_id      uuid primary key references public.coupon_buckets(id) on delete cascade,
  affiliate_url  text check (affiliate_url is null or affiliate_url ~ '^https://'),
  static_code    text
);

-- Patrons only need to know whether a reward opens a link, not the link itself.
alter table public.coupon_buckets add column has_link boolean not null default false;

create table public.questions (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references public.matches(id) on delete cascade,
  venue_id          uuid references public.venues(id) on delete cascade,   -- null = all venues
  prompt            text not null check (char_length(prompt) between 5 and 160),
  options           text[] not null check (array_length(options, 1) between 2 and 6),
  correct_option    smallint,          -- 0-based. Only set at resolution, so it never leaks early.
  points            int not null default 10 check (points between 1 and 1000),
  coupon_bucket_id  uuid references public.coupon_buckets(id) on delete set null,
  answer_window_s   int not null default 30 check (answer_window_s between 5 and 600),
  status            public.question_status not null default 'draft',
  pushed_at         timestamptz,
  locks_at          timestamptz,
  resolved_at       timestamptz,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index questions_match_status_idx on public.questions (match_id, status);

create table public.answers (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references public.questions(id) on delete cascade,
  session_id       uuid not null references public.player_sessions(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  selected_option  smallint not null,
  answered_at      timestamptz not null default now(),
  is_correct       boolean,
  points_awarded   int not null default 0,
  unique (question_id, user_id)
);

create table public.user_coupons (
  id           uuid primary key default gen_random_uuid(),
  bucket_id    uuid not null references public.coupon_buckets(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  question_id  uuid references public.questions(id) on delete set null,
  venue_id     uuid references public.venues(id) on delete set null,     -- where it was won
  code         text,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz,
  redeemed_at  timestamptz,
  redeemed_by  uuid references auth.users(id) on delete set null,
  unique (bucket_id, user_id, question_id)
);
create index user_coupons_user_idx on public.user_coupons (user_id, issued_at desc);
create unique index user_coupons_code_uidx on public.user_coupons (code)
  where code is not null and code like 'MD-%';

create table public.banners (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid references public.venues(id) on delete cascade,   -- null = everywhere
  title       text not null,
  subtitle    text,
  image_url   text check (image_url is null or image_url ~ '^https://'),
  link_url    text check (link_url is null or link_url ~ '^https://'),
  sort_order  int not null default 0,
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.click_analytics (
  id              bigserial primary key,
  user_id         uuid references public.users(id) on delete set null,
  user_coupon_id  uuid references public.user_coupons(id) on delete set null,
  bucket_id       uuid not null references public.coupon_buckets(id) on delete cascade,
  venue_id        uuid references public.venues(id) on delete set null,
  clicked_at      timestamptz not null default now(),
  user_agent      text
);
create index click_analytics_bucket_idx on public.click_analytics (bucket_id, clicked_at desc);

create table public.pin_attempts (
  id            bigserial primary key,
  user_id       uuid not null references public.users(id) on delete cascade,
  venue_id      uuid not null references public.venues(id) on delete cascade,
  success       boolean not null,
  attempted_at  timestamptz not null default now()
);
create index pin_attempts_user_idx on public.pin_attempts (user_id, attempted_at desc);

-- ---------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------
create function private.has_role(roles public.staff_role[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = any (roles));
$$;

create function private.manages_venue(p_venue uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid()
      and (role in ('admin', 'game_master') or (role = 'venue_manager' and venue_id = p_venue))
  );
$$;

-- PIN window = 10 minutes. The PIN is derived, not stored, so it rotates
-- even if nobody has the venue dashboard open.
create function private.pin_window(p_at timestamptz default now())
returns bigint language sql stable as $$
  select floor(extract(epoch from p_at) / 600)::bigint;
$$;

create function private.venue_pin(p_venue uuid, p_window bigint)
returns text language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select lpad(
    ((('x' || substr(encode(hmac(convert_to(p_window::text, 'UTF8'), s.pin_secret, 'sha256'), 'hex'), 1, 8))::bit(32)::bigint
      % 10000))::text, 4, '0')
  from public.venue_secrets s where s.venue_id = p_venue;
$$;

-- Session is valid for the whole match unless the player goes quiet for
-- 45 minutes or a silent GPS re-check puts them well outside the venue.
create function private.session_active(s public.player_sessions)
returns boolean language sql stable as $$
  select not s.needs_reverify and s.last_seen_at > now() - interval '45 minutes';
$$;

create function private.require_player()
returns public.users language plpgsql stable security definer set search_path = public, pg_temp as $$
declare u public.users;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into u from public.users where id = auth.uid() and deleted_at is null;
  if not found then raise exception 'onboarding_required' using errcode = 'P0001'; end if;
  return u;
end $$;

create function private.require_role(roles public.staff_role[])
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not private.has_role(roles) then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- New venue -> new PIN secret
create function private.on_venue_created()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.venue_secrets (venue_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger venues_create_secret after insert on public.venues
  for each row execute function private.on_venue_created();

create function private.sync_bucket_has_link()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    update public.coupon_buckets set has_link = false where id = old.bucket_id;
    return old;
  end if;
  update public.coupon_buckets set has_link = (new.affiliate_url is not null) where id = new.bucket_id;
  return new;
end $$;
create trigger bucket_secrets_sync_link after insert or update or delete on public.coupon_bucket_secrets
  for each row execute function private.sync_bucket_has_link();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.users                 enable row level security;
alter table public.themes                enable row level security;
alter table public.venues                enable row level security;
alter table public.venue_secrets         enable row level security;
alter table public.staff                 enable row level security;
alter table public.matches               enable row level security;
alter table public.player_sessions       enable row level security;
alter table public.coupon_buckets        enable row level security;
alter table public.coupon_bucket_secrets enable row level security;
alter table public.questions             enable row level security;
alter table public.answers               enable row level security;
alter table public.user_coupons          enable row level security;
alter table public.banners               enable row level security;
alter table public.click_analytics       enable row level security;
alter table public.pin_attempts          enable row level security;

-- users: a patron sees only their own row. Writes go through RPCs.
create policy users_self_select on public.users for select to authenticated using (id = auth.uid());

-- themes / venues / matches / banners: public read, staff write
create policy themes_read  on public.themes  for select to anon, authenticated using (true);
create policy themes_write on public.themes  for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

create policy venues_read  on public.venues  for select to anon, authenticated
  using (is_active or private.has_role('{admin,game_master}'));
create policy venues_write on public.venues  for all to authenticated
  using (private.has_role('{admin}')) with check (private.has_role('{admin}'));

create policy matches_read  on public.matches for select to anon, authenticated using (true);
create policy matches_write on public.matches for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

create policy banners_read on public.banners for select to anon, authenticated
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or private.has_role('{admin,game_master}'));
create policy banners_write on public.banners for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

-- venue_secrets: no policies at all = no API access.

-- staff
create policy staff_self_read  on public.staff for select to authenticated
  using (user_id = auth.uid() or private.has_role('{admin}'));
create policy staff_admin_write on public.staff for all to authenticated
  using (private.has_role('{admin}')) with check (private.has_role('{admin}'));

-- player_sessions: own row, or staff of that venue
create policy sessions_read on public.player_sessions for select to authenticated
  using (user_id = auth.uid() or private.manages_venue(venue_id));

-- coupon buckets: patrons can see the public face of active buckets
create policy buckets_read  on public.coupon_buckets for select to authenticated
  using (is_active or private.has_role('{admin,game_master}'));
create policy buckets_write on public.coupon_buckets for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

create policy bucket_secrets_staff on public.coupon_bucket_secrets for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

-- questions: patrons never see drafts
create policy questions_read on public.questions for select to authenticated
  using (status <> 'draft' or private.has_role('{admin,game_master}'));
create policy questions_write on public.questions for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

-- answers: own only (inserted through submit_answer)
create policy answers_read on public.answers for select to authenticated
  using (user_id = auth.uid() or private.has_role('{admin,game_master}'));

-- wallet: own coupons, or staff of the venue where it was won
create policy coupons_read on public.user_coupons for select to authenticated
  using (user_id = auth.uid() or private.manages_venue(venue_id) or private.has_role('{admin,game_master}'));

-- analytics: admins only (rows are written by the server with the service role)
create policy clicks_admin_read on public.click_analytics for select to authenticated
  using (private.has_role('{admin,game_master}'));

-- pin_attempts: no policies = no API access.

-- ---------------------------------------------------------------------
-- Patron RPCs
-- ---------------------------------------------------------------------

create function public.complete_onboarding(
  p_display_name      text,
  p_age_21            boolean,
  p_age_25            boolean,
  p_location_consent  boolean,
  p_terms_accepted    boolean,
  p_marketing         boolean,
  p_terms_version     text
) returns public.users
language plpgsql security definer set search_path = public, pg_temp as $$
declare u public.users;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not coalesce(p_age_21, false)           then raise exception 'age_21_required'; end if;
  if not coalesce(p_location_consent, false) then raise exception 'location_consent_required'; end if;
  if not coalesce(p_terms_accepted, false)   then raise exception 'terms_required'; end if;

  insert into public.users as x (id, display_name, age_verified_21, age_verified_25,
                                 consent_agreed_at, location_consent_at, marketing_consent_at, terms_version)
  values (auth.uid(), btrim(p_display_name), true, coalesce(p_age_25, false),
          now(), now(), case when p_marketing then now() end, p_terms_version)
  on conflict (id) do update set
    display_name         = excluded.display_name,
    age_verified_25      = x.age_verified_25 or excluded.age_verified_25,
    consent_agreed_at    = now(),
    location_consent_at  = now(),
    marketing_consent_at = case when p_marketing then coalesce(x.marketing_consent_at, now()) end,
    terms_version        = excluded.terms_version,
    deleted_at           = null
  returning * into u;
  return u;
end $$;

-- Upgrade to 25+ later (needed to win spirits rewards)
create function public.confirm_age_25()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_player();
  update public.users set age_verified_25 = true where id = auth.uid();
end $$;

create function public.verify_presence_gps(
  p_venue_id uuid, p_match_id uuid, p_lat double precision, p_lng double precision
) returns table (ok boolean, distance_m numeric, session_id uuid, reason text)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v public.venues;
  pt extensions.geography;
  d numeric;
  sid uuid;
begin
  perform private.require_player();
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return query select false, null::numeric, null::uuid, 'bad_coordinates'; return;
  end if;
  select * into v from public.venues where id = p_venue_id and is_active;
  if not found then return query select false, null::numeric, null::uuid, 'venue_not_found'; return; end if;
  if not exists (select 1 from public.matches where id = p_match_id and status = 'live') then
    return query select false, null::numeric, null::uuid, 'match_not_live'; return;
  end if;

  pt := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  d  := round(st_distance(v.location, pt)::numeric, 1);

  if not st_dwithin(v.location, pt, v.geofence_radius_m) then
    return query select false, d, null::uuid, 'out_of_range'; return;
  end if;

  insert into public.player_sessions as s (user_id, venue_id, match_id, verification_method, distance_m)
  values (auth.uid(), p_venue_id, p_match_id, 'gps', d)
  on conflict (user_id, match_id) do update set
    venue_id = excluded.venue_id, verification_method = 'gps', distance_m = excluded.distance_m,
    verified_at = now(), last_seen_at = now(), needs_reverify = false
  returning s.id into sid;

  return query select true, d, sid, null::text;
end $$;

create function public.verify_presence_pin(p_venue_id uuid, p_match_id uuid, p_pin text)
returns table (ok boolean, session_id uuid, reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w bigint := private.pin_window();
  in_grace boolean := extract(epoch from now()) - w * 600 < 120;   -- old PIN accepted for 2 min
  good boolean;
  sid uuid;
begin
  perform private.require_player();
  if not exists (select 1 from public.venues where id = p_venue_id and is_active) then
    return query select false, null::uuid, 'venue_not_found'; return;
  end if;
  if not exists (select 1 from public.matches where id = p_match_id and status = 'live') then
    return query select false, null::uuid, 'match_not_live'; return;
  end if;
  if (select count(*) from public.pin_attempts
      where user_id = auth.uid() and not success and attempted_at > now() - interval '10 minutes') >= 5 then
    return query select false, null::uuid, 'too_many_attempts'; return;
  end if;

  good := p_pin ~ '^\d{4}$' and (
    p_pin = private.venue_pin(p_venue_id, w)
    or (in_grace and p_pin = private.venue_pin(p_venue_id, w - 1))
  );
  insert into public.pin_attempts (user_id, venue_id, success) values (auth.uid(), p_venue_id, good);

  if not good then return query select false, null::uuid, 'wrong_pin'; return; end if;

  insert into public.player_sessions as s (user_id, venue_id, match_id, verification_method, distance_m)
  values (auth.uid(), p_venue_id, p_match_id, 'pin', null)
  on conflict (user_id, match_id) do update set
    venue_id = excluded.venue_id, verification_method = 'pin', distance_m = null,
    verified_at = now(), last_seen_at = now(), needs_reverify = false
  returning s.id into sid;

  return query select true, sid, null::text;
end $$;

-- Called every ~2 minutes while the app is open. GPS players send a silent
-- position (permission already granted); PIN players send nulls.
create function public.session_heartbeat(
  p_match_id uuid, p_lat double precision default null, p_lng double precision default null
) returns table (active boolean, needs_reverify boolean, points_total int, venue_id uuid)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  s public.player_sessions;
  v public.venues;
  stale boolean;
  away boolean := false;
begin
  perform private.require_player();
  select * into s from public.player_sessions where user_id = auth.uid() and match_id = p_match_id for update;
  if not found then return query select false, true, 0, null::uuid; return; end if;

  stale := s.last_seen_at < now() - interval '45 minutes';

  if s.verification_method = 'gps' and p_lat is not null and p_lng is not null then
    select * into v from public.venues where id = s.venue_id;
    -- generous tolerance (3x radius) so indoor GPS drift never kicks a real patron out
    away := not st_dwithin(v.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
                           v.geofence_radius_m * 3);
  end if;

  update public.player_sessions ps
     set last_seen_at = case when stale or away then ps.last_seen_at else now() end,
         needs_reverify = ps.needs_reverify or stale or away
   where ps.id = s.id
  returning * into s;

  return query select private.session_active(s), s.needs_reverify, s.points_total, s.venue_id;
end $$;

create function public.submit_answer(p_question_id uuid, p_option smallint)
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

  select * into s from public.player_sessions where user_id = auth.uid() and match_id = q.match_id;
  if not found or not private.session_active(s) then raise exception 'verification_required'; end if;
  if q.venue_id is not null and q.venue_id <> s.venue_id then raise exception 'question_not_for_venue'; end if;

  insert into public.answers (question_id, session_id, user_id, selected_option)
  values (q.id, s.id, auth.uid(), p_option)
  on conflict (question_id, user_id) do nothing
  returning id into aid;
  if aid is null then raise exception 'already_answered'; end if;

  update public.player_sessions set last_seen_at = now() where id = s.id;
  return aid;
end $$;

create function public.get_leaderboard(p_match_id uuid, p_venue_id uuid default null, p_limit int default 50)
returns table (rank bigint, display_name text, venue_name text, points int, is_me boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with ranked as (
    select rank() over (order by s.points_total desc) as rank,
           u.display_name, v.name as venue_name, s.points_total as points,
           (s.user_id = auth.uid()) as is_me,
           s.verified_at
      from public.player_sessions s
      join public.users  u on u.id = s.user_id and u.deleted_at is null
      join public.venues v on v.id = s.venue_id
     where s.match_id = p_match_id
       and (p_venue_id is null or s.venue_id = p_venue_id)
  )
  select rank, display_name, venue_name, points, is_me
    from ranked
   where rank <= least(greatest(p_limit, 1), 200) or is_me
   order by rank, verified_at
   limit least(greatest(p_limit, 1), 200) + 1;
$$;

-- ---------------------------------------------------------------------
-- Game Master RPCs
-- ---------------------------------------------------------------------

create function public.push_question(p_question_id uuid)
returns public.questions
language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.questions;
begin
  perform private.require_role('{admin,game_master}');
  update public.questions
     set status = 'live', pushed_at = now(), locks_at = now() + make_interval(secs => answer_window_s)
   where id = p_question_id and status = 'draft'
     and exists (select 1 from public.matches m where m.id = match_id and m.status = 'live')
  returning * into q;
  if not found then raise exception 'cannot_push (question must be a draft and the match must be live)'; end if;
  return q;
end $$;

create function public.lock_question(p_question_id uuid)
returns public.questions
language plpgsql security definer set search_path = public, pg_temp as $$
declare q public.questions;
begin
  perform private.require_role('{admin,game_master}');
  update public.questions set status = 'locked', locks_at = least(locks_at, now())
   where id = p_question_id and status = 'live'
  returning * into q;
  if not found then raise exception 'cannot_lock'; end if;
  return q;
end $$;

create function public.resolve_question(p_question_id uuid, p_correct_option smallint)
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
             and (b.min_age = 21 or u.age_verified_25)   -- spirits rewards: 25+ only
           order by a.answered_at                        -- fastest correct answers first
           limit remaining
        ) w
      on conflict do nothing;
      get diagnostics n_issued = row_count;

      update public.coupon_buckets set issued_count = issued_count + n_issued where id = b.id;
    end if;
  end if;

  return query select n_correct, n_issued;
end $$;

create function public.void_question(p_question_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('{admin,game_master}');
  update public.questions set status = 'void', locks_at = least(coalesce(locks_at, now()), now())
   where id = p_question_id and status in ('draft', 'live', 'locked');
  if not found then raise exception 'cannot_void'; end if;
end $$;

-- Venue create/update with plain lat/lng (admin)
create function public.upsert_venue(
  p_id uuid, p_name text, p_slug text, p_address text, p_city text,
  p_lat double precision, p_lng double precision, p_radius int, p_theme_id uuid, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare vid uuid;
begin
  perform private.require_role('{admin}');
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'bad_coordinates'; end if;
  insert into public.venues as v (id, name, slug, address, city, location, geofence_radius_m, default_theme_id, is_active)
  values (coalesce(p_id, gen_random_uuid()), p_name, p_slug, p_address, coalesce(p_city, 'Mumbai'),
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, coalesce(p_radius, 150), p_theme_id, coalesce(p_active, true))
  on conflict (id) do update set
    name = excluded.name, slug = excluded.slug, address = excluded.address, city = excluded.city,
    location = excluded.location, geofence_radius_m = excluded.geofence_radius_m,
    default_theme_id = excluded.default_theme_id, is_active = excluded.is_active
  returning v.id into vid;
  return vid;
end $$;

-- Venue list with readable coordinates
create view public.venue_directory with (security_invoker = true) as
  select v.id, v.name, v.slug, v.address, v.city, v.geofence_radius_m, v.default_theme_id, v.is_active,
         extensions.st_y(v.location::extensions.geometry) as lat,
         extensions.st_x(v.location::extensions.geometry) as lng
    from public.venues v;

-- ---------------------------------------------------------------------
-- Venue dashboard RPCs
-- ---------------------------------------------------------------------

create function public.current_venue_pin(p_venue_id uuid)
returns table (pin text, valid_until timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare w bigint := private.pin_window();
begin
  if not private.manages_venue(p_venue_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select private.venue_pin(p_venue_id, w), to_timestamp((w + 1) * 600);
end $$;

create function public.venue_live_players(p_venue_id uuid, p_match_id uuid)
returns table (display_name text, method public.verify_method, points int, last_seen_at timestamptz, active boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not private.manages_venue(p_venue_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select u.display_name, s.verification_method, s.points_total, s.last_seen_at, private.session_active(s)
      from public.player_sessions s
      join public.users u on u.id = s.user_id and u.deleted_at is null
     where s.venue_id = p_venue_id and s.match_id = p_match_id
     order by s.points_total desc, s.verified_at;
end $$;

-- Venue staff redeem a unique-code reward. Returns what to check (ID for alcohol).
create function public.redeem_coupon(p_venue_id uuid, p_code text)
returns table (title text, brand_name text, is_alcohol boolean, min_age smallint, player text, redeemed_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.user_coupons;
begin
  if not private.manages_venue(p_venue_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.user_coupons
   where code = upper(btrim(p_code)) and code like 'MD-%'
   for update;
  if not found then raise exception 'code_not_found'; end if;
  if c.venue_id is distinct from p_venue_id then raise exception 'code_from_another_venue'; end if;
  if c.redeemed_at is not null then raise exception 'already_redeemed'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'expired'; end if;

  update public.user_coupons set redeemed_at = now(), redeemed_by = auth.uid() where id = c.id;

  return query
    select b.title, b.brand_name, b.is_alcohol, b.min_age, u.display_name, now()
      from public.coupon_buckets b, public.users u
     where b.id = c.bucket_id and u.id = c.user_id;
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
-- Private helpers: only the role checks are callable (they are used inside
-- RLS policies, which run as the caller). PIN derivation is callable only
-- by the definer functions above.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_role(public.staff_role[]), private.manages_venue(uuid)
  to anon, authenticated, service_role;

revoke execute on function
  public.complete_onboarding(text, boolean, boolean, boolean, boolean, boolean, text),
  public.confirm_age_25(),
  public.verify_presence_gps(uuid, uuid, double precision, double precision),
  public.verify_presence_pin(uuid, uuid, text),
  public.session_heartbeat(uuid, double precision, double precision),
  public.submit_answer(uuid, smallint),
  public.get_leaderboard(uuid, uuid, int),
  public.push_question(uuid), public.lock_question(uuid),
  public.resolve_question(uuid, smallint), public.void_question(uuid),
  public.upsert_venue(uuid, text, text, text, text, double precision, double precision, int, uuid, boolean),
  public.current_venue_pin(uuid), public.venue_live_players(uuid, uuid), public.redeem_coupon(uuid, text)
from public, anon;

grant execute on function
  public.complete_onboarding(text, boolean, boolean, boolean, boolean, boolean, text),
  public.confirm_age_25(),
  public.verify_presence_gps(uuid, uuid, double precision, double precision),
  public.verify_presence_pin(uuid, uuid, text),
  public.session_heartbeat(uuid, double precision, double precision),
  public.submit_answer(uuid, smallint),
  public.get_leaderboard(uuid, uuid, int),
  public.push_question(uuid), public.lock_question(uuid),
  public.resolve_question(uuid, smallint), public.void_question(uuid),
  public.upsert_venue(uuid, text, text, text, text, double precision, double precision, int, uuid, boolean),
  public.current_venue_pin(uuid), public.venue_live_players(uuid, uuid), public.redeem_coupon(uuid, text)
to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: patrons subscribe to question changes (RLS still applies)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.questions;
alter publication supabase_realtime add table public.matches;
