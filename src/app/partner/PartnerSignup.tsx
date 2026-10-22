"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { themeVars } from "@/lib/theme";

type Prices = { season_price_inr: number; per_reward_price_inr: number; signup_open: boolean };
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function PartnerSignup() {
  const router = useRouter();
  const [prices, setPrices] = useState<Prices | null>(null);
  const [f, setF] = useState({
    venueName: "", city: "Mumbai", address: "", coords: "", tables: "", contactName: "", phone: "", email: "", password: "", plan: "season", gstin: "", website: "", agree: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    supabase()
      .from("app_settings")
      .select("season_price_inr, per_reward_price_inr, signup_open")
      .maybeSingle()
      .then(({ data }) => setPrices(data as Prices | null));
  }, []);

  function here() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set("coords", `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Couldn't read your location. Paste the venue's coordinates from Google Maps instead (right-click the venue, copy the numbers).");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const m = f.coords.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return setError("Add the venue's location: tap “Use my location” while you're at the venue, or paste coordinates like 18.9937, 72.8258.");
    setBusy(true);
    const res = await fetch("/api/venue-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, lat: Number(m[1]), lng: Number(m[2]), tables: Number(f.tables) || 0 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(body.error ?? "Something went wrong. Try again.");
    }
    // Sign straight in; the dashboard then walks them through 2-step login.
    await supabase().auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password });
    router.push("/venue");
  }

  const input = "mt-1 w-full rounded-xl border border-ink/25 bg-black/25 px-4 py-3 text-[17px] text-ink placeholder:text-ink/40";

  return (
    <div className="brand-canvas min-h-dvh" style={themeVars(null)}>
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10">
        <Link href="/" className="font-display text-2xl font-bold text-brand">SportsAura</Link>

        <section className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-2">For sports bars, pubs and clubs</p>
            <h1 className="mt-3 font-display text-6xl font-bold leading-[0.95]">Turn match night into a game the whole bar plays.</h1>
            <p className="mt-5 text-lg text-ink/75">
              Guests scan the code on your TV and predict what happens next in the match. Right answers win points and rewards from your menu. Free for guests, nothing to download.
            </p>
            <ul className="mt-8 flex flex-col gap-4">
              {[
                ["Guests stay for the next question", "A question before every over keeps tables playing to the last ball."],
                ["Tables compete", "Table vs table leaderboards on your TV get groups competing."],
                ["Know your regulars", "A monthly report shows who came, who came back and which matches packed the room."],
                ["We run the game", "Our game host sends the questions live. You just put the TV screen on."],
              ].map(([t, b]) => (
                <li key={t} className="rounded-2xl bg-surface/70 px-5 py-4">
                  <p className="font-display text-xl font-bold">{t}</p>
                  <p className="text-ink/70">{b}</p>
                </li>
              ))}
            </ul>
            {prices && (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-ink/20 p-5">
                  <p className="font-semibold text-ink/70">Season pass</p>
                  <p className="font-display text-4xl font-bold">{inr(prices.season_price_inr)}</p>
                  <p className="text-sm text-ink/65">One payment for the season. Unlimited matches and players.</p>
                </div>
                <div className="rounded-2xl border border-ink/20 p-5">
                  <p className="font-semibold text-ink/70">Pay per reward</p>
                  <p className="font-display text-4xl font-bold">{inr(prices.per_reward_price_inr)}</p>
                  <p className="text-sm text-ink/65">Per reward redeemed. Nothing upfront.</p>
                </div>
              </div>
            )}
            <p className="mt-4 text-sm text-ink/55">Every new venue starts with a free 14-day trial once approved.</p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl bg-surface/80 p-6" aria-label="Venue signup">
            <h2 className="font-display text-3xl font-bold">Sign up your venue</h2>
            {prices && !prices.signup_open && (
              <p className="rounded-xl bg-black/30 px-4 py-3">Signups are paused right now. Email us and we&apos;ll set you up.</p>
            )}
            <label className="font-semibold">Venue name<input required className={input} value={f.venueName} onChange={(e) => set("venueName", e.target.value)} placeholder="The Dugout" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="font-semibold">City<input required className={input} value={f.city} onChange={(e) => set("city", e.target.value)} /></label>
              <label className="font-semibold">Tables (optional)<input type="number" min={0} max={200} className={input} value={f.tables} onChange={(e) => set("tables", e.target.value)} placeholder="20" /></label>
            </div>
            <label className="font-semibold">Address<input className={input} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Area, landmark" /></label>
            <div>
              <label className="font-semibold">
                Venue location
                <input className={input} value={f.coords} onChange={(e) => set("coords", e.target.value)} placeholder="18.9937, 72.8258" />
              </label>
              <button type="button" onClick={here} className="mt-2 rounded-xl border border-ink/25 px-4 py-2 text-sm font-semibold" disabled={locating}>
                {locating ? "Finding you…" : "Use my location (I'm at the venue)"}
              </button>
              <p className="mt-1 text-sm text-ink/55">Used only to check guests are in your venue.</p>
            </div>
            <hr className="border-ink/15" />
            <label className="font-semibold">Your name<input required className={input} value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="font-semibold">Mobile<input required inputMode="tel" className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" /></label>
              <label className="font-semibold">GSTIN (optional)<input className={input} value={f.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} /></label>
            </div>
            <label className="font-semibold">Work email<input required type="email" autoComplete="email" className={input} value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="font-semibold">Choose a password<input required type="password" minLength={10} autoComplete="new-password" className={input} value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="10+ characters" /></label>
            <fieldset>
              <legend className="font-semibold">Plan after the trial</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  ["season", "Season pass"],
                  ["per_reward", "Pay per reward"],
                ].map(([v, l]) => (
                  <label key={v} className={`cursor-pointer rounded-xl border-2 px-4 py-3 text-center font-semibold ${f.plan === v ? "border-brand bg-brand/15" : "border-ink/20"}`}>
                    <input type="radio" name="plan" value={v} checked={f.plan === v} onChange={() => set("plan", v)} className="sr-only" />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => set("website", e.target.value)} name="website" />
            <label className="flex items-start gap-3 text-[15px]">
              <input type="checkbox" required className="mt-1 size-5 accent-[var(--brand-primary)]" checked={f.agree} onChange={(e) => set("agree", e.target.checked)} />
              <span>
                I agree to the{" "}
                <Link href="/partner/terms" target="_blank" className="underline">Venue Partner Terms</Link> and the{" "}
                <Link href="/privacy" target="_blank" className="underline">Privacy Notice</Link>.
              </span>
            </label>
            {error && <p className="rounded-xl bg-red-500/20 px-4 py-3 text-red-100" role="alert">{error}</p>}
            <button className="rounded-xl bg-brand px-5 py-4 font-display text-xl font-bold text-on-brand disabled:opacity-50" disabled={busy || (prices ? !prices.signup_open : false)}>
              {busy ? "Setting up your venue…" : "Sign up my venue"}
            </button>
            <p className="text-sm text-ink/55">
              Already signed up? <Link href="/venue" className="underline">Go to your dashboard</Link>.
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
