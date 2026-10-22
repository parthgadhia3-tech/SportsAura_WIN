"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import { VenueShell, type VenueCtx } from "@/components/staff/VenueShell";
import type { VenueAccount } from "@/lib/types";

type Prices = { season_price_inr: number; per_reward_price_inr: number; season_ends_on: string | null };
type Payment = { id: string; plan: string; amount_paise: number; status: string; created_at: string; paid_at: string | null };
type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void };

const PLAN: Record<string, string> = { pilot: "Free pilot", season: "Season pass", per_reward: "Pay per reward" };
const STATUS: Record<string, string> = { pending: "Waiting for approval", trial: "Free trial", active: "Active", past_due: "Payment due", cancelled: "Paused" };
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const day = (d: string) => new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export default function BillingPage() {
  return <VenueShell title="Plan and billing">{(ctx) => <Billing {...ctx} />}</VenueShell>;
}

async function authed(path: string, body: unknown) {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function loadRazorpay(): Promise<RazorpayCtor | null> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(w.Razorpay ?? null);
    s.onerror = () => resolve(null);
    document.body.appendChild(s);
  });
}

function Billing({ venueId, account, refresh }: VenueCtx) {
  const [prices, setPrices] = useState<Prices | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [usage, setUsage] = useState<{ redeemed: number; due: number } | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    const sb = supabase();
    sb.from("app_settings").select("season_price_inr, per_reward_price_inr, season_ends_on").maybeSingle().then(({ data }) => setPrices(data as Prices));
    sb.from("payments").select("*").eq("venue_id", venueId).order("created_at", { ascending: false }).then(({ data }) => setPayments((data as Payment[]) ?? []));
    sb.rpc("venue_monthly_report", { p_venue_id: venueId, p_month: new Date().toISOString().slice(0, 10) }).then(({ data }) => {
      const r = data as { rewards_redeemed: number; billing: { amount_due_inr: number } | null } | null;
      if (r) setUsage({ redeemed: r.rewards_redeemed, due: r.billing?.amount_due_inr ?? 0 });
    });
  }, [venueId, account]);

  async function paySeason() {
    if (!venueId) return;
    setBusy(true);
    setMsg(null);
    const { ok, body } = await authed("/api/billing/order", { venueId });
    if (!ok) {
      setBusy(false);
      return setMsg({ text: friendlyError(String(body.error ?? "")), bad: body.error !== "billing_not_configured" });
    }
    const Razorpay = await loadRazorpay();
    if (!Razorpay) {
      setBusy(false);
      return setMsg({ text: "The payment window couldn't load. Check your connection and try again.", bad: true });
    }
    const rz = new Razorpay({
      key: body.keyId,
      amount: body.amount,
      currency: "INR",
      order_id: body.orderId,
      name: "SportsAura",
      description: `Season pass for ${body.venueName}`,
      prefill: body.prefill,
      theme: { color: "#0C2427" },
      handler: async (r: RazorpayResponse) => {
        const v = await authed("/api/billing/verify", { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
        setBusy(false);
        setMsg(v.ok ? { text: "Payment received. Your season pass is active. Thank you!" } : { text: String(v.body.error ?? "We couldn't confirm the payment."), bad: true });
        refresh();
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rz.on("payment.failed", () => setMsg({ text: "The payment didn't go through. You haven't been charged; try again.", bad: true }));
    rz.open();
  }

  async function choosePerReward() {
    if (!venueId || !confirm(`Switch to pay per reward? You'll be billed ${prices ? inr(prices.per_reward_price_inr) : ""} for each reward redeemed at your venue, every month.`)) return;
    const { ok, body } = await authed("/api/billing/plan", { venueId, plan: "per_reward" });
    setMsg(ok ? { text: "Switched to pay per reward. We'll send a bill at the end of each month." } : { text: String(body.error ?? "Couldn't switch."), bad: true });
    refresh();
  }

  if (account === undefined || !prices) return <main className="p-5 text-white/60">Loading…</main>;
  const acc = account as VenueAccount | null;
  const seasonLabel = prices.season_ends_on ? `valid until ${day(prices.season_ends_on)}` : "valid for 90 days";

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-5">
      <section className="rounded-2xl bg-white/[.06] p-6">
        <p className="text-sm text-white/60">Your plan</p>
        <p className="font-display text-4xl font-bold">{acc ? PLAN[acc.plan] : "Free pilot"}</p>
        <p className="mt-1 text-white/75">
          {acc ? STATUS[acc.status] : "Active"}
          {acc?.paid_until ? ` · until ${day(acc.paid_until)}` : ""}
        </p>
        {acc?.plan === "per_reward" && usage && (
          <p className="mt-3 rounded-lg bg-white/10 px-4 py-3">
            This month so far: {usage.redeemed} rewards redeemed = <strong>{inr(usage.due)}</strong>. Billed at the end of the month.
          </p>
        )}
      </section>

      {msg && (
        <p className={`rounded-lg px-4 py-3 font-semibold ${msg.bad ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-100"}`} role="status">
          {msg.text}
        </p>
      )}

      {acc?.status === "pending" ? (
        <p className="rounded-2xl bg-white/[.06] p-6 text-white/80">
          We&apos;re reviewing your signup and will call you within one working day. You can pay for a season pass now to go live straight away, or wait for our call.
        </p>
      ) : null}

      {acc?.status !== "cancelled" && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className={`flex flex-col rounded-2xl p-6 ${acc?.plan === "season" && acc.status === "active" ? "bg-[#FFB020] text-black" : "bg-white/[.06]"}`}>
            <p className="font-display text-2xl font-bold">Season pass</p>
            <p className="tabular mt-1 font-display text-5xl font-extrabold">{inr(prices.season_price_inr)}</p>
            <p className="mt-1 text-sm opacity-75">One payment, {seasonLabel}. Every match, unlimited players and rewards.</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm opacity-90">
              <li>Live game, TV screen and dashboard</li>
              <li>Table vs table and city leaderboards</li>
              <li>Monthly report for your team</li>
            </ul>
            <button className="mt-auto rounded-lg bg-[#0C2427] px-5 py-3 font-bold text-white disabled:opacity-50 [&:not(:first-child)]:mt-6" disabled={busy} onClick={paySeason}>
              {acc?.plan === "season" && acc.status === "active" ? "Renew season pass" : `Pay ${inr(prices.season_price_inr)}`}
            </button>
          </div>
          <div className={`flex flex-col rounded-2xl p-6 ${acc?.plan === "per_reward" ? "bg-[#7FE0C8] text-black" : "bg-white/[.06]"}`}>
            <p className="font-display text-2xl font-bold">Pay per reward</p>
            <p className="tabular mt-1 font-display text-5xl font-extrabold">{inr(prices.per_reward_price_inr)}</p>
            <p className="mt-1 text-sm opacity-75">For each reward a guest redeems at your venue. Nothing upfront, billed monthly.</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm opacity-90">
              <li>Same features as the season pass</li>
              <li>You only pay when guests come to redeem</li>
            </ul>
            {acc?.plan === "per_reward" ? (
              <p className="mt-6 font-semibold">This is your plan.</p>
            ) : (
              <button
                className="mt-6 rounded-lg border-2 border-current px-5 py-3 font-bold disabled:opacity-50"
                disabled={acc?.status === "pending"}
                onClick={choosePerReward}
                title={acc?.status === "pending" ? "Available once your venue is approved" : undefined}
              >
                Choose pay per reward
              </button>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white/[.06] p-6">
        <h2 className="text-lg font-semibold">Payments</h2>
        {payments.filter((p) => p.status === "paid").length === 0 ? (
          <p className="mt-2 text-sm text-white/60">No payments yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-white/10 text-sm">
            {payments.filter((p) => p.status === "paid").map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{PLAN[p.plan]} · {p.paid_at ? day(p.paid_at) : ""}</span>
                <span className="tabular font-semibold">{inr(p.amount_paise / 100)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-white/45">Payments are processed securely by Razorpay. We never see your card or bank details. Need a GST invoice? Email us with your GSTIN.</p>
      </section>
    </main>
  );
}
