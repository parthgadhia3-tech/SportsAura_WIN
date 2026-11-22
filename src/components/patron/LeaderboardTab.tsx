"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Match } from "@/lib/types";
import { Spinner } from "./ui";
import { GroupsPanel, useMyGroups } from "./Groups";

type Scope = "match" | "series";
type Row = { rank: number; display_name: string; points: number; correct?: number; matches?: number; is_me: boolean };

/** Leaderboard for this match or the whole series, for everyone or one of your groups. */
export function LeaderboardTab({ match, seriesName }: { match: Match; seriesName: string | null }) {
  const [scope, setScope] = useState<Scope>("match");
  const [group, setGroup] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const { groups, reload } = useMyGroups();
  const hasSeries = Boolean(match.series_id);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data } =
      scope === "series" && match.series_id
        ? await sb.rpc("series_leaderboard", { p_series_id: match.series_id, p_group: group, p_limit: 50 })
        : await sb.rpc("match_leaderboard", { p_match_id: match.id, p_group: group, p_limit: 50 });
    setRows((data as Row[]) ?? []);
  }, [scope, group, match.id, match.series_id]);

  useEffect(() => {
    setRows(null);
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const groupName = groups?.find((g) => g.id === group)?.name;

  return (
    <div className="flex flex-col gap-5 px-5 pb-6 pt-3">
      {hasSeries && (
        <div className="grid grid-cols-2 rounded-xl bg-black/25 p-1" role="tablist" aria-label="Leaderboard for">
          {(
            [
              ["match", "This match"],
              ["series", "Whole series"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={scope === k}
              onClick={() => setScope(k)}
              className={`rounded-lg py-2.5 font-semibold ${scope === k ? "bg-brand text-on-brand" : "text-ink/70"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {groups && groups.length > 0 && (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Show">
          {[{ id: null as string | null, name: "Everyone" }, ...groups].map((g) => (
            <button
              key={g.id ?? "all"}
              onClick={() => setGroup(g.id)}
              aria-pressed={group === g.id}
              className={`shrink-0 rounded-full border-2 px-4 py-1.5 text-[15px] font-semibold ${group === g.id ? "border-brand bg-brand text-on-brand" : "border-ink/20 text-ink/80"}`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <p className="-mb-2 text-sm text-ink/60">
        {scope === "series" && seriesName ? seriesName : match.title}
        {groupName ? ` · ${groupName}` : " · everyone playing"}
      </p>

      {rows === null ? (
        <Spinner label="Loading leaderboard" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-surface/60 px-4 py-10 text-center text-ink/70">
          {group ? "Nobody from this group has played yet. Invite them below." : "No scores yet. Answer the first question to get on the board."}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={`${r.rank}-${r.display_name}-${i}`}
              className={`flex items-center gap-4 rounded-2xl px-4 py-3 ${r.is_me ? "bg-brand text-on-brand" : "bg-surface/70"} ${
                r.is_me && i > 0 && rows[i - 1].rank + 1 < r.rank ? "mt-4" : ""
              }`}
            >
              <span className="tabular w-9 font-display text-2xl font-bold">{r.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">
                  {r.display_name}
                  {r.is_me && " (you)"}
                </span>
                <span className="block truncate text-sm opacity-70">
                  {scope === "series" ? `${r.matches} ${r.matches === 1 ? "match" : "matches"}` : `${r.correct} right`}
                </span>
              </span>
              <span className="tabular font-display text-2xl font-bold">{r.points}</span>
            </li>
          ))}
        </ol>
      )}

      {groups && <GroupsPanel groups={groups} onChanged={reload} onOpen={setGroup} />}
    </div>
  );
}
