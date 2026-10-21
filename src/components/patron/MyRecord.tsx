"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Record = {
  matches_played: number;
  total_points: number;
  predictions: number;
  correct: number;
  rewards_won: number;
  best_finish: number | null;
  member_since: string;
};
type MatchRow = {
  match_id: string;
  match_title: string;
  played_at: string;
  venue_name: string;
  points: number;
  finish: number;
  players: number;
  correct: number;
  predictions: number;
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Everything a player has done, loaded from their account (not the device). */
export function MyRecord() {
  const [rec, setRec] = useState<Record | null | undefined>(undefined);
  const [history, setHistory] = useState<MatchRow[]>([]);

  useEffect(() => {
    const sb = supabase();
    sb.rpc("my_record").then(({ data }) => setRec(((data as Record[]) ?? [])[0] ?? null));
    sb.rpc("my_match_history", { p_limit: 30 }).then(({ data }) => setHistory((data as MatchRow[]) ?? []));
  }, []);

  if (rec === undefined) return <div className="h-40" aria-busy="true" />;
  if (!rec) return null;

  const accuracy = rec.predictions ? Math.round((rec.correct / rec.predictions) * 100) : null;
  const stats: [string, string][] = [
    ["Points", rec.total_points.toLocaleString("en-IN")],
    ["Matches", String(rec.matches_played)],
    ["Accuracy", accuracy == null ? "–" : `${accuracy}%`],
    ["Rewards", String(rec.rewards_won)],
  ];

  return (
    <section aria-labelledby="record-heading" className="flex flex-col gap-4">
      <h3 id="record-heading" className="font-display text-2xl font-bold">
        My record
      </h3>
      <dl className="grid grid-cols-2 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-surface/80 px-4 py-3">
            <dt className="text-sm text-ink/60">{label}</dt>
            <dd className="tabular font-display text-4xl font-bold leading-tight">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-ink/60">
        {rec.best_finish ? `Best finish: ${ordinal(rec.best_finish)} at a venue. ` : ""}
        {rec.correct} of {rec.predictions} predictions right. Playing since{" "}
        {new Date(rec.member_since).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}.
      </p>

      {history.length > 0 && (
        <ul className="flex flex-col divide-y divide-ink/10 rounded-2xl bg-surface/70">
          {history.map((h) => (
            <li key={h.match_id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{h.match_title}</p>
                <p className="truncate text-sm text-ink/60">
                  {new Date(h.played_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, {h.venue_name},{" "}
                  {h.correct}/{h.predictions} right
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular font-display text-2xl font-bold leading-none">{h.points}</p>
                <p className="text-xs text-ink/60">
                  {ordinal(h.finish)} of {h.players}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
