"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LeaderRow, Match, Season, Venue } from "@/lib/types";
import { Spinner } from "./ui";

type Scope = "venue" | "tables" | "all" | "city";
type TableRow = { rank: number; table_no: number; players: number; points: number; is_mine: boolean | null };
type CityRow = { rank: number; display_name: string; points: number; matches: number; home_venue: string; is_me: boolean };

export function LeaderboardTab({ venue, match }: { venue: Venue; match: Match | null }) {
  const [scope, setScope] = useState<Scope>("venue");
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [city, setCity] = useState<CityRow[] | null>(null);
  const [season, setSeason] = useState<Season | null>(null);

  // A city season running today in this venue's city?
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase()
      .from("seasons")
      .select("*")
      .eq("is_active", true)
      .ilike("city", venue.city.trim())
      .lte("starts_on", today)
      .gte("ends_on", today)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setSeason((data as Season) ?? null));
  }, [venue.city]);

  const load = useCallback(async () => {
    const sb = supabase();
    if (scope === "city") {
      if (!season) return setCity([]);
      const { data } = await sb.rpc("city_leaderboard", { p_season_id: season.id, p_limit: 50 });
      return setCity((data as CityRow[]) ?? []);
    }
    if (!match) return scope === "tables" ? setTables([]) : setRows([]);
    if (scope === "tables") {
      const { data } = await sb.rpc("get_table_leaderboard", { p_match_id: match.id, p_venue_id: venue.id, p_limit: 30 });
      return setTables((data as TableRow[]) ?? []);
    }
    const { data } = await sb.rpc("get_leaderboard", {
      p_match_id: match.id,
      p_venue_id: scope === "venue" ? venue.id : null,
      p_limit: 50,
    });
    setRows((data as LeaderRow[]) ?? []);
  }, [match, scope, venue.id, season]);

  useEffect(() => {
    setRows(null);
    setTables(null);
    setCity(null);
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const scopes: { key: Scope; label: string }[] = [
    { key: "venue", label: "This bar" },
    ...((venue.table_count ?? 0) > 0 ? [{ key: "tables" as const, label: "Tables" }] : []),
    { key: "all", label: "All venues" },
    ...(season ? [{ key: "city" as const, label: "City season" }] : []),
  ];

  return (
    <div className="px-5 pb-6 pt-4">
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-black/25 p-1" role="tablist">
        {scopes.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={scope === s.key}
            onClick={() => setScope(s.key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2.5 text-[15px] font-semibold ${scope === s.key ? "bg-brand text-on-brand" : "text-ink/70"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {scope === "city" && season && (
        <div className="mb-4 rounded-2xl bg-surface/70 px-4 py-3">
          <p className="font-display text-xl font-bold">{season.name}</p>
          <p className="text-sm text-ink/70">
            Every match at every venue in {season.city}, {fmtDate(season.starts_on)} to {fmtDate(season.ends_on)}.
          </p>
          {season.prize_text && (
            <p className="mt-2 font-semibold text-brand">
              {season.prize_text}
              {season.prize_terms_url && (
                <a href={season.prize_terms_url} target="_blank" rel="noopener" className="ml-2 text-sm font-normal text-ink/70 underline">
                  Prize terms
                </a>
              )}
            </p>
          )}
        </div>
      )}

      {scope === "tables" && (
        <p className="mb-4 text-sm text-ink/70">Each table scores its best four players. Pick your table on the Play tab.</p>
      )}

      {scope !== "city" && !match ? (
        <p className="py-12 text-center text-ink/70">The leaderboard opens when a match goes live.</p>
      ) : scope === "tables" ? (
        tables === null ? (
          <Spinner label="Loading tables" />
        ) : tables.length === 0 ? (
          <p className="py-12 text-center text-ink/70">No tables yet. Be the first: pick your table on the Play tab.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {tables.map((r) => (
              <Row key={r.table_no} rank={r.rank} me={Boolean(r.is_mine)} title={`Table ${r.table_no}`} sub={`${r.players} ${r.players === 1 ? "player" : "players"}`} points={r.points} />
            ))}
          </ol>
        )
      ) : scope === "city" ? (
        city === null ? (
          <Spinner label="Loading city season" />
        ) : city.length === 0 ? (
          <p className="py-12 text-center text-ink/70">No season points yet. Get a right answer to get on the city board.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {city.map((r, i) => (
              <Row key={`${r.rank}-${i}`} rank={r.rank} me={r.is_me} title={r.display_name} sub={`${r.home_venue} · ${r.matches} ${r.matches === 1 ? "match" : "matches"}`} points={r.points} gap={r.is_me && i > 0 && city[i - 1].rank + 1 < r.rank} />
            ))}
          </ol>
        )
      ) : rows === null ? (
        <Spinner label="Loading leaderboard" />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-ink/70">No scores yet. Answer the first question to get on the board.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <Row key={`${r.rank}-${r.display_name}-${i}`} rank={r.rank} me={r.is_me} title={r.display_name} sub={scope === "all" ? r.venue_name : undefined} points={r.points} gap={r.is_me && i > 0 && rows[i - 1].rank + 1 < r.rank} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({ rank, me, title, sub, points, gap }: { rank: number; me: boolean; title: string; sub?: string; points: number; gap?: boolean }) {
  return (
    <li className={`flex items-center gap-4 rounded-2xl px-4 py-3 ${me ? "bg-brand text-on-brand" : "bg-surface/70"} ${gap ? "mt-4" : ""}`}>
      <span className="tabular w-9 font-display text-2xl font-bold">{rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-semibold">
          {title}
          {me && " (you)"}
        </span>
        {sub && <span className="block truncate text-sm opacity-70">{sub}</span>}
      </span>
      <span className="tabular font-display text-2xl font-bold">{points}</span>
    </li>
  );
}

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
