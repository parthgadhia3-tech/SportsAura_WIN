"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LeaderRow, Match, Question, Sponsor, Venue, VenueAccount } from "@/lib/types";

/** Current rotating PIN for a venue, refreshed the moment it changes. */
export function useVenuePin(venueId: string | null) {
  const [pin, setPin] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!venueId) return;
    const { data, error } = await supabase().rpc("current_venue_pin", { p_venue_id: venueId });
    if (error) return setError(error.message);
    const r = (data as { pin: string; valid_until: string }[])[0];
    setPin(r.pin);
    setValidUntil(new Date(r.valid_until).getTime());
    setError("");
  }, [venueId]);

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [load]);

  // Refresh just after the window rolls over. Retries every 5s until the new PIN arrives.
  const lastTry = useRef(0);
  useEffect(() => {
    if (!validUntil || now < validUntil + 1500 || now - lastTry.current < 5000) return;
    lastTry.current = now;
    load();
  }, [now, validUntil, load]);

  const secondsLeft = validUntil ? Math.max(0, Math.round((validUntil - now) / 1000)) : 0;
  return { pin, secondsLeft, error };
}

/** The TV QR code (changes every 30 seconds). */
export function useVenueQr(venueId: string | null) {
  const [code, setCode] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState(0);

  const load = useCallback(async () => {
    if (!venueId) return;
    const { data } = await supabase().rpc("current_venue_qr", { p_venue_id: venueId });
    const r = (data as { code: string; valid_until: string }[] | null)?.[0];
    if (!r) return;
    setCode(r.code);
    setValidUntil(new Date(r.valid_until).getTime());
  }, [venueId]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch the next code just after this one rolls over; retry every 3s if offline.
  useEffect(() => {
    if (!validUntil) return;
    const t = setTimeout(load, Math.max(500, validUntil - Date.now() + 400));
    const retry = setInterval(() => Date.now() > validUntil + 3000 && load(), 3000);
    return () => {
      clearTimeout(t);
      clearInterval(retry);
    };
  }, [validUntil, load]);

  return { code, validUntil };
}

export function useLiveMatch() {
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  useEffect(() => {
    const load = () =>
      supabase()
        .from("matches")
        .select("*")
        .eq("status", "live")
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setMatch((data as Match) ?? null));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  return match;
}

export function useLeaderboard(matchId: string | undefined, venueId: string | null, limit = 10) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  useEffect(() => {
    if (!matchId || !venueId) return setRows([]);
    const load = () =>
      supabase()
        .rpc("get_leaderboard", { p_match_id: matchId, p_venue_id: venueId, p_limit: limit })
        .then(({ data }) => setRows(((data as LeaderRow[]) ?? []).filter((r) => r.rank <= limit)));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [matchId, venueId, limit]);
  return rows;
}

export function useVenue(venueId: string | null, version = 0) {
  const [venue, setVenue] = useState<Venue | null>(null);
  useEffect(() => {
    if (!venueId) return;
    supabase()
      .from("venues")
      .select("id, name, slug, address, city, geofence_radius_m, default_theme_id, is_active, table_count")
      .eq("id", venueId)
      .maybeSingle()
      .then(({ data }) => setVenue(data as Venue));
  }, [venueId, version]);
  return venue;
}

/** The question on phones right now (for the TV), plus its sponsor. */
export function useLiveQuestion(match: Match | null | undefined, venueId: string | null) {
  const [q, setQ] = useState<Question | null>(null);
  const [sponsor, setSponsor] = useState<Pick<Sponsor, "id" | "name" | "logo_url" | "tagline"> | null>(null);
  useEffect(() => {
    if (!match) return setQ(null);
    const sb = supabase();
    const load = async () => {
      const { data } = await sb
        .from("questions")
        .select("*")
        .eq("match_id", match.id)
        .in("status", ["live", "locked", "resolved"])
        .order("pushed_at", { ascending: false })
        .limit(3);
      const list = ((data as Question[]) ?? []).filter((x) => !x.venue_id || x.venue_id === venueId);
      const cur = list.find((x) => x.status !== "resolved") ??
        list.find((x) => x.resolved_at && Date.now() - new Date(x.resolved_at).getTime() < 20_000) ?? null;
      setQ(cur);
      const sid = cur?.sponsor_id ?? match.sponsor_id;
      if (sid) {
        const { data: sp } = await sb.from("sponsors").select("id, name, logo_url, tagline").eq("id", sid).maybeSingle();
        setSponsor(sp as Pick<Sponsor, "id" | "name" | "logo_url" | "tagline"> | null);
      } else setSponsor(null);
    };
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [match, venueId]);
  return { q, sponsor };
}

export type TableRow = { rank: number; table_no: number; players: number; points: number };
export function useTableBoard(matchId: string | undefined, venueId: string | null, on: boolean, limit = 5) {
  const [rows, setRows] = useState<TableRow[]>([]);
  useEffect(() => {
    if (!matchId || !venueId || !on) return setRows([]);
    const load = () =>
      supabase()
        .rpc("get_table_leaderboard", { p_match_id: matchId, p_venue_id: venueId, p_limit: limit })
        .then(({ data }) => setRows((data as TableRow[]) ?? []));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [matchId, venueId, on, limit]);
  return rows;
}

export function useVenueAccount(venueId: string | null, version = 0) {
  const [acc, setAcc] = useState<VenueAccount | null | undefined>(undefined);
  useEffect(() => {
    if (!venueId) return;
    supabase()
      .from("venue_accounts")
      .select("*")
      .eq("venue_id", venueId)
      .maybeSingle()
      .then(({ data }) => setAcc((data as VenueAccount) ?? null));
  }, [venueId, version]);
  return acc;
}

export const fmtCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
