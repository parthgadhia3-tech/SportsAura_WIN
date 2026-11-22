-- Game Master analytics without venues or coupons: how each match played.
create function public.admin_match_stats(p_limit integer default 30)
returns table(match_id uuid, title text, series text, status text, starts_at timestamptz,
              players integer, answers integer, correct integer, questions integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('{admin,game_master}');
  return query
    select m.id, m.title, se.name, m.status::text, m.starts_at,
           (select count(*)::int from public.player_sessions s where s.match_id = m.id),
           (select count(*)::int from public.answers a join public.questions q on q.id = a.question_id where q.match_id = m.id),
           (select count(*)::int from public.answers a join public.questions q on q.id = a.question_id where q.match_id = m.id and a.is_correct),
           (select count(*)::int from public.questions q where q.match_id = m.id and q.status in ('resolved', 'void', 'live', 'locked'))
      from public.matches m
      left join public.series se on se.id = m.series_id
     where m.published_at is not null
     order by m.starts_at desc
     limit least(greatest(p_limit, 1), 200);
end $$;

create function public.admin_totals()
returns table(players integer, players_7d integer, groups integer, group_members integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_role('{admin,game_master}');
  return query select
    (select count(*)::int from public.users where deleted_at is null),
    (select count(distinct user_id)::int from public.player_sessions where last_seen_at > now() - interval '7 days'),
    (select count(*)::int from public.play_groups),
    (select count(*)::int from public.play_group_members);
end $$;

revoke all on function public.admin_match_stats(integer), public.admin_totals() from public, anon;
grant execute on function public.admin_match_stats(integer), public.admin_totals() to authenticated;
