"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError, LIABILITY_LINE } from "@/lib/copy";
import type { Venue } from "@/lib/types";
import { StaffGate, type StaffMember } from "@/components/staff/StaffGate";
import { fmtCountdown, useLeaderboard, useLiveMatch, useVenue, useVenuePin } from "@/components/staff/useVenueData";

export default function VenuePage() {
  return (
    <StaffGate roles={["venue_manager", "admin", "game_master"]} title="Venue dashboard" dark>
      {(staff) => <Dashboard staff={staff} />}
    </StaffGate>
  );
}

type Player = { display_name: string; method: "gps" | "pin" | "qr"; points: number; last_seen_at: string; active: boolean };
type Redeemed = { title: string; brand_name: string; is_alcohol: boolean; min_age: number; player: string };

function Dashboard({ staff }: { staff: StaffMember }) {
  const [venueId, setVenueId] = useState<string | null>(staff.venue_id);
  const [venues, setVenues] = useState<Venue[]>([]);

  useEffect(() => {
    if (staff.role === "venue_manager") return;
    supabase()
      .from("venues")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const list = (data as Venue[]) ?? [];
        setVenues(list);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem("md-venue");
        } catch {
          /* ignore */
        }
        setVenueId((cur) => cur ?? (list.find((v) => v.id === saved)?.id || list[0]?.id || null));
      });
  }, [staff.role]);

  const venue = useVenue(venueId);
  const match = useLiveMatch();
  const { pin, secondsLeft, error: pinError } = useVenuePin(venueId);
  const board = useLeaderboard(match?.id, venueId, 10);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!venueId || !match) return setPlayers([]);
    const load = () =>
      supabase()
        .rpc("venue_live_players", { p_venue_id: venueId, p_match_id: match.id })
        .then(({ data }) => setPlayers((data as Player[]) ?? []));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [venueId, match]);

  const active = players.filter((p) => p.active);
  const by = (m: Player["method"]) => active.filter((p) => p.method === m).length;

  return (
    <div className="min-h-dvh bg-[#0E1716] text-[#EEF2EF]">
      <header className="flex flex-wrap items-center gap-4 border-b border-white/10 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold">{venue?.name ?? "Venue"}</p>
          <p className="text-sm text-white/60">{match ? `Live: ${match.title}` : match === null ? "No live match" : " "}</p>
        </div>
        {venues.length > 1 && (
          <select
            className="rounded-md bg-white/10 px-3 py-2"
            value={venueId ?? ""}
            onChange={(e) => {
              setVenueId(e.target.value);
              try {
                localStorage.setItem("md-venue", e.target.value);
              } catch {
                /* ignore */
              }
            }}
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id} className="text-black">{v.name}</option>
            ))}
          </select>
        )}
        {venueId && (
          <Link href={`/venue/tv?venue=${venueId}`} target="_blank" className="rounded-md bg-[#FFB020] px-4 py-2 font-bold text-black">
            Open TV screen
          </Link>
        )}
        <button className="rounded-md border border-white/20 px-3 py-2 text-sm" onClick={() => supabase().auth.signOut()}>
          Sign out
        </button>
      </header>

      <main className="grid gap-5 p-5 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="flex flex-col gap-5">
          <section className="rounded-2xl bg-white/[.06] p-6 text-center">
            <h2 className="text-lg font-semibold text-white/75">Check-in PIN</h2>
            <p className="tabular my-2 font-display text-[7rem] font-extrabold leading-none tracking-[0.12em] text-[#FFB020]" aria-live="polite">
              {pin ?? "····"}
            </p>
            <div className="mx-auto h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-[#FFB020] transition-[width] duration-1000 ease-linear" style={{ width: `${(secondsLeft / 600) * 100}%` }} />
            </div>
            <p className="tabular mt-2 text-white/70">New PIN in {fmtCountdown(secondsLeft)}</p>
            <p className="mt-4 text-sm text-white/55">
              Give this to guests whose location check fails. Players only need it once per match.
            </p>
            {pinError && <p className="mt-2 text-sm text-red-300">{friendlyError(pinError)}</p>}
          </section>

          <Redeem venueId={venueId} />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-2xl bg-white/[.06] p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Players checked in</h2>
              <p className="tabular font-display text-4xl font-bold text-[#7FE0C8]">{active.length}</p>
            </div>
            <p className="text-sm text-white/55">
              {by("qr")} by TV code, {by("gps")} by location, {by("pin")} by PIN
            </p>
            <ul className="mt-4 flex max-h-[60dvh] flex-col divide-y divide-white/10 overflow-y-auto">
              {players.map((p, i) => (
                <li key={i} className={`flex items-center justify-between py-2 ${p.active ? "" : "opacity-40"}`}>
                  <span>
                    {p.display_name}
                    <span className="ml-2 text-xs text-white/50">{p.method === "pin" ? "PIN" : p.method === "qr" ? "TV QR" : "GPS"}{p.active ? "" : ", left"}</span>
                  </span>
                  <span className="tabular font-semibold">{p.points}</span>
                </li>
              ))}
              {players.length === 0 && <li className="py-6 text-center text-white/50">No one has checked in yet.</li>}
            </ul>
          </section>

          <section className="rounded-2xl bg-white/[.06] p-5">
            <h2 className="text-lg font-semibold">Leaderboard</h2>
            <ol className="mt-4 flex flex-col gap-2">
              {board.map((r, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg bg-white/[.05] px-3 py-2">
                  <span className="tabular w-8 font-display text-2xl font-bold text-[#FFB020]">{r.rank}</span>
                  <span className="flex-1 truncate">{r.display_name}</span>
                  <span className="tabular font-display text-2xl font-bold">{r.points}</span>
                </li>
              ))}
              {board.length === 0 && <li className="py-6 text-center text-white/50">Scores appear after the first result.</li>}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}

function Redeem({ venueId }: { venueId: string | null }) {
  const [code, setCode] = useState("MD-");
  const [result, setResult] = useState<Redeemed | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId) return;
    setBusy(true);
    setError("");
    setResult(null);
    const { data, error } = await supabase().rpc("redeem_coupon", { p_venue_id: venueId, p_code: code });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setResult((data as Redeemed[])[0]);
    setCode("MD-");
  }

  return (
    <section className="rounded-2xl bg-white/[.06] p-5">
      <h2 className="text-lg font-semibold">Redeem a reward</h2>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          className="tabular min-w-0 flex-1 rounded-lg bg-white/10 px-4 py-3 font-display text-2xl font-bold uppercase tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          aria-label="Reward code"
          autoComplete="off"
        />
        <button className="rounded-lg bg-[#7FE0C8] px-5 font-bold text-black disabled:opacity-50" disabled={busy || code.length < 6}>
          Redeem
        </button>
      </form>
      {error && <p className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-red-200">{error}</p>}
      {result && (
        <div className={`mt-3 rounded-lg px-4 py-3 ${result.is_alcohol ? "bg-[#FFB020] text-black" : "bg-emerald-500/20"}`}>
          <p className="text-lg font-bold">{result.title}</p>
          <p className="text-sm">Redeemed for {result.player}</p>
          {result.is_alcohol && (
            <p className="mt-2 font-bold">
              Check ID: guest must be {result.min_age} or older.
            </p>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-white/45">{LIABILITY_LINE}</p>
    </section>
  );
}
