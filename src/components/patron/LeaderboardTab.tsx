"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LeaderRow, Match, Venue } from "@/lib/types";
import { Spinner } from "./ui";

export function LeaderboardTab({ venue, match }: { venue: Venue; match: Match | null }) {
  const [scope, setScope] = useState<"venue" | "all">("venue");
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  const load = useCallback(async () => {
    if (!match) return setRows([]);
    const { data } = await supabase().rpc("get_leaderboard", {
      p_match_id: match.id,
      p_venue_id: scope === "venue" ? venue.id : null,
      p_limit: 50,
    });
    setRows((data as LeaderRow[]) ?? []);
  }, [match, scope, venue.id]);

  useEffect(() => {
    setRows(null);
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="px-5 pb-6 pt-4">
      <div className="mb-5 grid grid-cols-2 rounded-xl bg-black/25 p-1" role="tablist">
        {(["venue", "all"] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className={`rounded-lg py-2.5 font-semibold ${scope === s ? "bg-brand text-on-brand" : "text-ink/70"}`}
          >
            {s === "venue" ? venue.name : "All venues"}
          </button>
        ))}
      </div>

      {!match ? (
        <p className="py-12 text-center text-ink/70">The leaderboard opens when a match goes live.</p>
      ) : rows === null ? (
        <Spinner label="Loading leaderboard" />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-ink/70">No scores yet. Answer the first question to get on the board.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={`${r.rank}-${r.display_name}-${i}`}
              className={`flex items-center gap-4 rounded-2xl px-4 py-3 ${
                r.is_me ? "bg-brand text-on-brand" : "bg-surface/70"
              } ${r.is_me && i > 0 && rows[i - 1].rank + 1 < r.rank ? "mt-4" : ""}`}
            >
              <span className="tabular w-9 font-display text-2xl font-bold">{r.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">
                  {r.display_name}
                  {r.is_me && " (you)"}
                </span>
                {scope === "all" && <span className="block truncate text-sm opacity-70">{r.venue_name}</span>}
              </span>
              <span className="tabular font-display text-2xl font-bold">{r.points}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
