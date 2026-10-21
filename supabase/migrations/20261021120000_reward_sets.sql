-- =====================================================================
-- Reward sets: a named, ordered list of coupons (e.g. set "Z" = Z1..Z20)
-- attached to a match. Every correct answer in that match wins exactly one
-- coupon from the set:
--   1. event coupons first: "first right answer" (player's 1st correct in
--      the match), "every N right answers" (player's Nth, 2Nth, ...)
--   2. otherwise a random coupon from the set's "random" pool (repeats OK)
--   3. if nothing in the pool has stock left, any coupon in the set with
--      stock, so 100% of correct answers are rewarded while stock lasts.
-- Counting is per player, per match.
-- =====================================================================

create type public.reward_rule as enum ('random', 'first_correct', 'every_n_correct');

create table public.reward_sets (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z][A-Z0-9]{0,5}$'),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.coupon_buckets
  add column set_id        uuid references public.reward_sets(id) on delete set null,
  add column set_position  int check (set_position is null or set_position between 1 and 999),
  add column rule          public.reward_rule not null default 'random',
  add column rule_n        int check (rule_n is null or rule_n between 2 and 500),
  add constraint buckets_rule_n_needed check (rule <> 'every_n_correct' or rule_n is not null),
  add constraint buckets_set_position_unique unique (set_id, set_position);

alter table public.matches
  add column reward_set_id uuid references public.reward_sets(id) on delete set null;

alter table public.reward_sets enable row level security;
create policy reward_sets_read on public.reward_sets for select to authenticated
  using (true);
create policy reward_sets_write on public.reward_sets for all to authenticated
  using (private.has_role('{admin,game_master}')) with check (private.has_role('{admin,game_master}'));

-- Position is assigned automatically (next number in the set) when not given.
create function private.assign_set_position()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.set_id is null then
    new.set_position := null;
  elsif new.set_position is null or (tg_op = 'UPDATE' and new.set_id is distinct from old.set_id) then
    select coalesce(max(set_position), 0) + 1 into new.set_position
      from public.coupon_buckets where set_id = new.set_id and id <> new.id;
  end if;
  return new;
end $$;
create trigger buckets_assign_set_position before insert or update of set_id, set_position on public.coupon_buckets
  for each row execute function private.assign_set_position();

-- Picks the coupon for one correct answer. Returns null if the set has no stock.
create function private.pick_set_coupon(p_set uuid, p_user uuid, p_correct_count int)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  is25 boolean;
  pick uuid;
begin
  select age_verified_25 into is25 from public.users where id = p_user;

  -- shared filter: active, in date, in stock, age-eligible
  -- 1. first right answer
  if p_correct_count = 1 then
    select b.id into pick from public.coupon_buckets b
     where b.set_id = p_set and b.rule = 'first_correct' and b.is_active
       and (b.valid_until is null or b.valid_until > now())
       and (b.total_quantity is null or b.issued_count < b.total_quantity)
       and (b.min_age = 21 or coalesce(is25, false))
     order by b.set_position limit 1;
    if pick is not null then return pick; end if;
  end if;

  -- 2. every N right answers (largest N wins if several match)
  select b.id into pick from public.coupon_buckets b
   where b.set_id = p_set and b.rule = 'every_n_correct' and b.is_active
     and p_correct_count % b.rule_n = 0
     and (b.valid_until is null or b.valid_until > now())
     and (b.total_quantity is null or b.issued_count < b.total_quantity)
     and (b.min_age = 21 or coalesce(is25, false))
   order by b.rule_n desc, b.set_position limit 1;
  if pick is not null then return pick; end if;

  -- 3. random pool
  select b.id into pick from public.coupon_buckets b
   where b.set_id = p_set and b.rule = 'random' and b.is_active
     and (b.valid_until is null or b.valid_until > now())
     and (b.total_quantity is null or b.issued_count < b.total_quantity)
     and (b.min_age = 21 or coalesce(is25, false))
   order by random() limit 1;
  if pick is not null then return pick; end if;

  -- 4. fallback: anything in the set with stock, so nobody goes empty-handed
  select b.id into pick from public.coupon_buckets b
   where b.set_id = p_set and b.is_active
     and (b.valid_until is null or b.valid_until > now())
     and (b.total_quantity is null or b.issued_count < b.total_quantity)
     and (b.min_age = 21 or coalesce(is25, false))
   order by random() limit 1;
  return pick;
end $$;
revoke execute on function private.pick_set_coupon(uuid, uuid, int) from public, anon, authenticated;

create function private.issue_coupon(p_bucket uuid, p_user uuid, p_question uuid, p_venue uuid)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  b public.coupon_buckets;
  sec public.coupon_bucket_secrets;
  n int;
begin
  select * into b from public.coupon_buckets where id = p_bucket for update;
  if not found or (b.total_quantity is not null and b.issued_count >= b.total_quantity) then return false; end if;
  select * into sec from public.coupon_bucket_secrets where bucket_id = b.id;

  insert into public.user_coupons (bucket_id, user_id, question_id, venue_id, code, expires_at)
  values (b.id, p_user, p_question, p_venue,
          case b.code_mode
            when 'unique' then 'MD-' || upper(encode(gen_random_bytes(4), 'hex'))
            when 'static' then sec.static_code
          end,
          b.valid_until)
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update public.coupon_buckets set issued_count = issued_count + 1 where id = b.id; end if;
  return n > 0;
end $$;
revoke execute on function private.issue_coupon(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Settlement now also hands out reward-set coupons
-- ---------------------------------------------------------------------
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

  update public.answers
     set is_correct = (selected_option = p_correct_option),
         points_awarded = case when selected_option = p_correct_option then q.points else 0 end
   where question_id = q.id;

  update public.player_sessions s
     set points_total = s.points_total + q.points
    from public.answers a
   where a.question_id = q.id and a.is_correct and a.session_id = s.id;
  get diagnostics n_correct = row_count;

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

-- Read-only stock view for the console (how many coupons are left in a set)
create function public.reward_set_stock(p_set uuid)
returns table (total_left bigint, unlimited boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(greatest(total_quantity - issued_count, 0)) filter (where total_quantity is not null), 0),
         bool_or(total_quantity is null)
    from public.coupon_buckets
   where set_id = p_set and is_active and (valid_until is null or valid_until > now())
     and private.has_role('{admin,game_master}');
$$;
revoke execute on function public.reward_set_stock(uuid) from public, anon;
grant execute on function public.reward_set_stock(uuid) to authenticated;
