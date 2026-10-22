"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError, LIABILITY_LINE } from "@/lib/copy";
import { VenueShell, type VenueCtx } from "@/components/staff/VenueShell";
import { fmtCountdown, useLeaderboard, useLiveMatch, useVenuePin } from "@/components/staff/useVenueData";

export default function VenuePage() {
  return <VenueShell title="Venue dashboard">{(ctx) => <Dashboard {...ctx} />}</VenueShell>;
}

type Player = { display_name: string; method: "gps" | "pin" | "qr"; points: number; last_seen_at: string; active: boolean };
type Redeemed = { title: string; brand_name: string; is_alcohol: boolean; min_age: number; player: string };

function Dashboard({ venueId, venue, refresh }: VenueCtx) {
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
    <main className="grid gap-5 p-5 lg:grid-cols-[minmax(320px,420px)_1fr]">
      <div className="flex flex-col gap-5">
        <p className="rounded-2xl bg-white/[.06] px-5 py-3 text-sm text-white/75">
          {match ? <>Live now: <strong className="text-white">{match.title}</strong></> : match === null ? "No live match right now. The game host starts it before the first ball." : " "}
        </p>
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
            Most guests scan the code on the TV. Give this PIN to anyone whose camera or location doesn&apos;t work. They only need it once per match.
          </p>
          {pinError && <p className="mt-2 text-sm text-red-300">{friendlyError(pinError)}</p>}
        </section>

        <Redeem venueId={venueId} />
        <TablePlay venueId={venueId} count={venue?.table_count ?? 0} onSaved={refresh} />
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
            {players.length === 0 && <li className="py-6 text-center text-white/50">No one has checked in yet. Put the TV screen on and guests can scan in.</li>}
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
  );
}

function TablePlay({ venueId, count, onSaved }: { venueId: string | null; count: number; onSaved: () => void }) {
  const [n, setN] = useState(String(count));
  const [msg, setMsg] = useState("");
  useEffect(() => setN(String(count)), [count]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!venueId) return;
    const { error } = await supabase().rpc("set_venue_tables", { p_venue_id: venueId, p_count: Number(n) || 0 });
    if (error) return setMsg(friendlyError(error));
    setMsg(Number(n) > 0 ? "Saved. Print table coasters so guests join their table automatically." : "Table play is off.");
    onSaved();
  }
  return (
    <section className="rounded-2xl bg-white/[.06] p-5">
      <h2 className="text-lg font-semibold">Table vs table</h2>
      <p className="mt-1 text-sm text-white/60">Groups compete as a table: each table scores its best four players, shown on the TV and in the app.</p>
      <form onSubmit={save} className="mt-3 flex items-end gap-2">
        <label className="flex-1 text-sm text-white/70">
          Number of tables (0 = off)
          <input type="number" min={0} max={200} value={n} onChange={(e) => setN(e.target.value)} className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-lg text-white" />
        </label>
        <button className="rounded-lg bg-[#7FE0C8] px-5 py-2.5 font-bold text-black">Save</button>
      </form>
      {msg && <p className="mt-2 text-sm text-white/75">{msg}</p>}
      {count > 0 && (
        <Link href="/venue/coasters" className="mt-3 inline-block text-sm font-semibold text-[#FFB020] underline">
          Print table coasters
        </Link>
      )}
    </section>
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
