-- =====================================================================
-- Security + legal settings
--  1. Staff must use 2-step login (TOTP) for any staff action (aal2)
--  2. Audit log of admin / game master / venue actions
--  3. Players can switch club offers on or off without deleting account
--  4. Platform settings: T&C link, privacy link, operator + grievance details
-- =====================================================================

-- ---------------------------------------------------------------------
-- Platform settings (single row)
-- ---------------------------------------------------------------------
create table public.app_settings (
  id                    boolean primary key default true check (id),
  terms_url             text check (terms_url is null or terms_url ~ '^https://'),
  privacy_url           text check (privacy_url is null or privacy_url ~ '^https://'),
  operator_name         text,
  operator_address      text,
  grievance_name        text,
  grievance_email       text check (grievance_email is null or grievance_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  support_email         text check (support_email is null or support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  require_staff_mfa     boolean not null default true,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id) on delete set null
);
insert into public.app_settings (id) values (true);

alter table public.app_settings enable row level security;
-- Everyone (including logged-out players) may read; it holds only public info.
create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- 2-step login enforcement for staff
-- ---------------------------------------------------------------------
create or replace function private.staff_mfa_ok()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not coalesce((select require_staff_mfa from public.app_settings where id), true);
$$;

create or replace function private.has_role(roles public.staff_role[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = any (roles))
     and private.staff_mfa_ok();
$$;

create or replace function private.manages_venue(p_venue uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid()
      and (role in ('admin', 'game_master') or (role = 'venue_manager' and venue_id = p_venue))
  ) and private.staff_mfa_ok();
$$;
grant execute on function private.staff_mfa_ok() to anon, authenticated, service_role;

-- Only admins (with 2-step login) can change settings.
create policy app_settings_write on public.app_settings for update to authenticated
  using (private.has_role('{admin}')) with check (private.has_role('{admin}'));

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  summary     text,
  details     jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
alter table public.audit_log enable row level security;
create policy audit_log_admin_read on public.audit_log for select to authenticated
  using (private.has_role('{admin}'));
-- No insert/update/delete policies: rows are written only by triggers below.

create function private.audit(p_action text, p_entity text, p_entity_id text, p_summary text, p_details jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, details)
  values (auth.uid(),
          coalesce((select name from public.staff where user_id = auth.uid()),
                   (select email from auth.users where id = auth.uid()),
                   'system'),
          p_action, p_entity, p_entity_id, p_summary, p_details);
end $$;

-- Questions: push / lock / settle / void
create function private.audit_questions()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('create', 'question', new.id::text, new.prompt, null);
  elsif tg_op = 'DELETE' then
    perform private.audit('delete', 'question', old.id::text, old.prompt, null);
    return old;
  elsif new.status is distinct from old.status then
    perform private.audit(new.status::text, 'question', new.id::text,
      case when new.status = 'resolved'
           then new.prompt || ' => ' || new.options[new.correct_option + 1]
           else new.prompt end,
      jsonb_build_object('from', old.status, 'to', new.status, 'correct_option', new.correct_option));
  end if;
  return new;
end $$;
create trigger questions_audit after insert or update or delete on public.questions
  for each row execute function private.audit_questions();

-- Generic config tables: rewards, sets, matches, venues, staff, banners, themes, settings
create function private.audit_generic()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  label text;
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  label := coalesce(rec ->> 'title', rec ->> 'name', rec ->> 'code', rec ->> 'role', tg_table_name);
  perform private.audit(lower(tg_op), tg_table_name, coalesce(rec ->> 'id', rec ->> 'user_id', rec ->> 'bucket_id'), label,
    case when tg_op = 'UPDATE' then
      (select jsonb_object_agg(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k))
         from jsonb_object_keys(to_jsonb(new)) k
        where to_jsonb(old) -> k is distinct from to_jsonb(new) -> k
          and k not in ('issued_count', 'updated_at', 'has_link'))
    end);
  return coalesce(new, old);
end $$;

create trigger coupon_buckets_audit after insert or update or delete on public.coupon_buckets
  for each row when (pg_trigger_depth() = 0) execute function private.audit_generic();
create trigger reward_sets_audit after insert or update or delete on public.reward_sets
  for each row execute function private.audit_generic();
create trigger matches_audit after insert or update or delete on public.matches
  for each row execute function private.audit_generic();
create trigger venues_audit after insert or update or delete on public.venues
  for each row execute function private.audit_generic();
create trigger staff_audit after insert or update or delete on public.staff
  for each row execute function private.audit_generic();
create trigger banners_audit after insert or update or delete on public.banners
  for each row execute function private.audit_generic();
create trigger app_settings_audit after update on public.app_settings
  for each row execute function private.audit_generic();
create trigger bucket_secrets_audit after insert or update or delete on public.coupon_bucket_secrets
  for each row execute function private.audit_generic();

-- Reward redemptions at the venue
create function private.audit_redeem()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.redeemed_at is not null and old.redeemed_at is null then
    perform private.audit('redeem', 'user_coupon', new.id::text, new.code, jsonb_build_object('venue_id', new.venue_id));
  end if;
  return new;
end $$;
create trigger user_coupons_audit after update on public.user_coupons
  for each row execute function private.audit_redeem();

-- ---------------------------------------------------------------------
-- Players: switch club offers on/off (DPDP: withdraw consent as easily as given)
-- ---------------------------------------------------------------------
create function public.set_marketing_consent(p_on boolean)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare ts timestamptz;
begin
  perform private.require_player();
  update public.users
     set marketing_consent_at = case when p_on then coalesce(marketing_consent_at, now()) end
   where id = auth.uid()
  returning marketing_consent_at into ts;
  return ts;
end $$;
revoke execute on function public.set_marketing_consent(boolean) from public, anon;
grant execute on function public.set_marketing_consent(boolean) to authenticated;

revoke execute on function private.audit(text, text, text, text, jsonb) from public, anon, authenticated;
