"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import { VenueShell } from "@/components/staff/VenueShell";

type Report = {
  month: string;
  venue: string;
  match_nights: number;
  checkins: number;
  unique_players: number;
  new_players: number;
  returning_players: number;
  regulars: number;
  by_method: { qr: number; gps: number; pin: number };
  table_players: number;
  predictions: number;
  correct: number;
  avg_predictions: number | null;
  rewards_won: number;
  rewards_redeemed: number;
  offers_opt_in: number;
  prev_checkins: number;
  prev_unique_players: number;
  top_matches: { title: string; starts_at: string; sport: string; players: number; predictions: number }[];
  busiest_days: { day: string; checkins: number }[];
  top_players: { name: string; points: number; nights: number }[];
  top_rewards: { title: string; won: number; redeemed: number }[];
  billing: { plan: string; status: string; paid_until: string | null; per_reward_price_inr: number; amount_due_inr: number } | null;
};

function months(n = 12) {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push({ value: d.toISOString().slice(0, 10).replace(/-\d\d$/, "-01"), label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function ReportPage() {
  return <VenueShell title="Monthly report">{({ venueId }) => <ReportView venueId={venueId} />}</VenueShell>;
}

function ReportView({ venueId }: { venueId: string | null }) {
  const list = useMemo(() => months(), []);
  const [month, setMonth] = useState(list[0].value);
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!venueId) return;
    setR(null);
    setError("");
    supabase()
      .rpc("venue_monthly_report", { p_venue_id: venueId, p_month: month })
      .then(({ data, error }) => (error ? setError(friendlyError(error)) : setR(data as Report)));
  }, [venueId, month]);

  const change = (cur: number, prev: number) => {
    if (!prev) return cur ? "new this month" : "";
    const pct = Math.round(((cur - prev) / prev) * 100);
    return `${pct >= 0 ? "+" : ""}${pct}% vs last month`;
  };

  return (
    <main className="p-5 print:p-0">
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center gap-3 print:hidden">
        <label className="text-sm text-white/70">
          Month{" "}
          <select className="ml-2 rounded-md bg-white/10 px-3 py-2 text-white" value={month} onChange={(e) => setMonth(e.target.value)}>
            {list.map((m) => (
              <option key={m.value} value={m.value} className="text-black">{m.label}</option>
            ))}
          </select>
        </label>
        <button className="ml-auto rounded-md bg-[#FFB020] px-4 py-2 font-bold text-black" onClick={() => window.print()} disabled={!r}>
          Print or save as PDF
        </button>
      </div>

      {error && <p className="mx-auto max-w-4xl rounded-lg bg-red-500/20 px-4 py-3 text-red-200">{error}</p>}
      {!r && !error && <p className="mx-auto max-w-4xl text-white/60">Loading report…</p>}

      {r && (
        <article className="mx-auto max-w-4xl rounded-2xl bg-[#FBFAF5] p-8 text-[#0C2427] shadow-xl print:max-w-none print:rounded-none print:shadow-none">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#DCD8CB] pb-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-[#B36E00]">SportsAura monthly report</p>
              <h1 className="mt-1 font-display text-5xl font-bold leading-none">{r.venue}</h1>
              <p className="mt-2 text-lg text-[#3E4B49]">{r.month}</p>
            </div>
            <p className="text-sm text-[#5E6A68]">Generated {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</p>
          </header>

          {r.checkins === 0 ? (
            <p className="py-16 text-center text-lg text-[#5E6A68]">No check-ins this month yet. Numbers appear after your first match night.</p>
          ) : (
            <>
              <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Guests who played" value={r.unique_players} note={change(r.unique_players, r.prev_unique_players)} />
                <Stat label="Check-ins" value={r.checkins} note={change(r.checkins, r.prev_checkins)} />
                <Stat label="Match nights" value={r.match_nights} />
                <Stat label="Came back 2+ nights" value={r.regulars} note={r.unique_players ? `${Math.round((r.regulars / r.unique_players) * 100)}% of guests` : ""} />
                <Stat label="First-time guests" value={r.new_players} />
                <Stat label="Returning from before" value={r.returning_players} />
                <Stat label="Predictions made" value={r.predictions} note={r.avg_predictions ? `${r.avg_predictions} per check-in` : ""} />
                <Stat label="Opted in to your offers" value={r.offers_opt_in} />
              </section>

              <section className="mt-6 grid gap-6 sm:grid-cols-2">
                <Block title="Rewards">
                  <p className="text-lg">
                    <strong>{r.rewards_won}</strong> won, <strong>{r.rewards_redeemed}</strong> redeemed at your venue
                    {r.rewards_won ? ` (${Math.round((r.rewards_redeemed / r.rewards_won) * 100)}% redemption)` : ""}.
                  </p>
                  <Table
                    head={["Reward", "Won", "Redeemed"]}
                    rows={r.top_rewards.map((x) => [x.title, x.won, x.redeemed])}
                    empty="No rewards given out this month."
                  />
                </Block>
                <Block title="How guests checked in">
                  <Bar label="Scanned the TV code" n={r.by_method.qr} total={r.checkins} />
                  <Bar label="Location check" n={r.by_method.gps} total={r.checkins} />
                  <Bar label="Venue PIN" n={r.by_method.pin} total={r.checkins} />
                  <Bar label="Played as a table" n={r.table_players} total={r.checkins} />
                </Block>
              </section>

              <section className="mt-6">
                <Block title="Busiest match nights">
                  <Table
                    head={["Match", "Date", "Guests", "Predictions"]}
                    rows={r.top_matches.map((m) => [m.title, new Date(m.starts_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), m.players, m.predictions])}
                    empty="No matches."
                  />
                </Block>
              </section>

              <section className="mt-6 grid gap-6 sm:grid-cols-2">
                <Block title="Busiest days of the week">
                  {r.busiest_days.map((d) => (
                    <Bar key={d.day} label={d.day} n={d.checkins} total={r.checkins} />
                  ))}
                </Block>
                <Block title="Top players this month">
                  <Table head={["Player", "Points", "Nights"]} rows={r.top_players.map((p) => [p.name, p.points, p.nights])} empty="No scores yet." />
                </Block>
              </section>

              {r.billing && r.billing.plan === "per_reward" && (
                <section className="mt-6 rounded-xl border border-[#DCD8CB] p-4">
                  <p className="font-semibold">
                    Pay-per-reward plan: {r.rewards_redeemed} redeemed × ₹{r.billing.per_reward_price_inr} = ₹{r.billing.amount_due_inr.toLocaleString("en-IN")} (plus GST)
                  </p>
                </section>
              )}
            </>
          )}
          <p className="mt-8 border-t border-[#DCD8CB] pt-4 text-xs text-[#5E6A68]">
            Counts come from SportsAura check-ins at this venue. Guests are counted once per match night. Player names are display names chosen by guests.
          </p>
        </article>
      )}
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl bg-[#F1EEE4] p-4">
      <p className="text-sm text-[#5E6A68]">{label}</p>
      <p className="tabular font-display text-4xl font-bold leading-tight">{value.toLocaleString("en-IN")}</p>
      {note && <p className="text-xs font-semibold text-[#0F7A5C]">{note}</p>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <h2 className="mb-2 font-display text-2xl font-bold">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Bar({ label, n, total }: { label: string; n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular font-semibold">{n} ({pct}%)</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-[#E6E2D6]">
        <div className="h-2 rounded-full bg-[#0F7A5C]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-[#5E6A68]">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[#5E6A68]">
          {head.map((h, i) => (
            <th key={h} className={`py-1 ${i ? "text-right" : ""}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-[#E6E2D6]">
            {r.map((c, j) => (
              <td key={j} className={`py-1.5 ${j ? "tabular text-right" : ""}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
