"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ErrorNote, Field, GhostButton, PrimaryButton, inputClass } from "./ui";

export function PhoneLogin({ venueName }: { venueName: string }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const e164 = `+91${phone}`;
  const validPhone = /^[6-9]\d{9}$/.test(phone);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
    setCooldown(30);
  }

  async function verify() {
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.verifyOtp({ phone: e164, token: otp, type: "sms" });
    setBusy(false);
    if (error) setError("That code didn't work. Check the SMS and try again.");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-end gap-8 px-6 pb-10 pt-16">
      <div>
        <p className="text-lg text-ink/70">You&apos;re at {venueName}</p>
        <h1 className="mt-1 font-display text-5xl font-bold leading-[0.95]">
          Call the next play. Win the room.
        </h1>
        <p className="mt-4 text-[17px] text-ink/75">
          Free live predictions during the match. Score points, climb the bar&apos;s leaderboard and win rewards.
        </p>
      </div>

      {!sent ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (validPhone) sendCode();
          }}
        >
          <Field label="Mobile number" hint="We'll text you a 6-digit code. No password needed.">
            <div className="flex items-stretch gap-2">
              <span className="flex items-center rounded-xl bg-black/25 px-4 text-lg text-ink/70">+91</span>
              <input
                className={inputClass}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton type="submit" disabled={!validPhone || busy}>
            {busy ? "Sending code" : "Send code"}
          </PrimaryButton>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (otp.length === 6) verify();
          }}
        >
          <Field label={`Code sent to +91 ${phone}`}>
            <input
              className={`${inputClass} tabular text-center font-display text-3xl tracking-[0.5em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton type="submit" disabled={otp.length !== 6 || busy}>
            {busy ? "Checking" : "Verify and continue"}
          </PrimaryButton>
          <div className="flex gap-3">
            <GhostButton type="button" onClick={() => { setSent(false); setOtp(""); }}>
              Change number
            </GhostButton>
            <GhostButton type="button" disabled={cooldown > 0 || busy} onClick={sendCode}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </GhostButton>
          </div>
        </form>
      )}
    </div>
  );
}
