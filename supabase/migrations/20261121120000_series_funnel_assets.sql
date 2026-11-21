-- =====================================================================
-- Series → Theme → Match → Publish funnel, and uploaded brand images.
--  1. series: a tournament or bilateral series that owns a theme and a title sponsor
--  2. themes: banner image and up to 4 partner logos next to the title sponsor logo
--  3. matches: belong to a series, need a rewards choice, and must be published
--     (checked by publish_match) before they can go live
--  4. storage bucket brand-assets: public read, staff write, 1 MB cap, images only.
--     The CMS shrinks every upload to WebP in the browser before it is sent.
-- =====================================================================

-- every element of a text[] is an https URL
create function private.all_https(arr text[])
returns boolean language sql immutable set search_path = pg_catalog as $$
  select coalesce(bool_and(x ~ '^https://[^\s"''()<>]+$'), true) from unnest(arr) x
$$;

-- 1. Series ------------------------------------------------------------
create table public.series (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 3 and 80),
  sport          text not null default 'cricket',
  starts_on      date not null,
  ends_on        date not null,
  theme_id       uuid references public.themes(id) on delete set null,
  sponsor_id     uuid references public.sponsors(id) on delete set null,
  no_sponsor     boolean not null default false,   -- explicit "no title sponsor" so the step can be completed
  reward_set_id  uuid references public.reward_sets(id) on delete set null,  -- default for new matches
  is_archived    boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint series_dates check (ends_on >= starts_on)
);
alter table public.series enable row level security;
create policy series_read on public.series for select to anon, authenticated using (true);
create policy series_write on public.series for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));
create trigger series_audit after insert or update or delete on public.series
  for each row execute function private.audit_generic();

-- 2. Themes: banner + partner logos -----------------------------------
alter table public.themes
  add column banner_url    text check (banner_url is null or banner_url ~ '^https://[^\s"''()<>]+$'),
  add column partner_logos text[] not null default '{}'
    check (cardinality(partner_logos) <= 4 and private.all_https(partner_logos));
create trigger themes_audit after insert or update or delete on public.themes
  for each row execute function private.audit_generic();

-- 3. Matches: series, rewards choice, publishing -----------------------
alter table public.matches
  add column series_id     uuid references public.series(id) on delete set null,
  add column reward_mode   text check (reward_mode in ('set', 'per_question')),
  add column published_at  timestamptz;
create index matches_series_idx on public.matches (series_id, starts_at);

-- Anything that already exists stays usable.
update public.matches set published_at = coalesce(published_at, now()),
  reward_mode = coalesce(reward_mode, case when reward_set_id is null then 'per_question' else 'set' end);

-- A match can only go live once it has been published.
create function private.guard_match_live()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'live' and new.published_at is null then
    raise exception 'not_published';
  end if;
  return new;
end $$;
create trigger matches_guard_live before insert or update of status, published_at on public.matches
  for each row execute function private.guard_match_live();

-- What is still missing before a match can be published. Empty array = ready.
create function public.match_checklist(p_match uuid)
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
  if m.reward_mode is null then missing := missing || 'rewards'; end if;
  if m.reward_mode = 'set' and m.reward_set_id is null then missing := missing || 'reward_set'; end if;
  return missing;
end $$;

-- Publish: only when nothing is missing. Copies the series look and sponsor onto
-- the match so the player app (which reads match.theme_id / sponsor_id) shows them.
create function public.publish_match(p_match uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  missing text[];
  s public.series;
begin
  perform private.require_role('{admin,game_master}');
  missing := public.match_checklist(p_match);
  if cardinality(missing) > 0 then
    raise exception 'not_ready: %', array_to_string(missing, ',');
  end if;
  select se.* into s from public.series se join public.matches m on m.series_id = se.id where m.id = p_match;
  update public.matches
     set theme_id     = coalesce(theme_id, s.theme_id),
         sponsor_id   = coalesce(sponsor_id, s.sponsor_id),
         published_at = now()
   where id = p_match;
end $$;

create function public.unpublish_match(p_match uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('{admin,game_master}');
  if exists (select 1 from public.matches where id = p_match and status = 'live') then
    raise exception 'match_is_live';
  end if;
  update public.matches set published_at = null where id = p_match;
end $$;

revoke all on function public.match_checklist(uuid), public.publish_match(uuid), public.unpublish_match(uuid) from public, anon;
grant execute on function public.match_checklist(uuid), public.publish_match(uuid), public.unpublish_match(uuid) to authenticated;

-- 4. Storage for logos, banners and backgrounds ------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 1048576,
        array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy brand_assets_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and private.has_role('{admin,game_master}'));
create policy brand_assets_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets' and private.has_role('{admin,game_master}'))
  with check (bucket_id = 'brand-assets' and private.has_role('{admin,game_master}'));
