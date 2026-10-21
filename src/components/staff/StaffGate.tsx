"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { StaffRole } from "@/lib/types";

export interface StaffMember {
  user_id: string;
  role: StaffRole;
  venue_id: string | null;
  name: string | null;
}

type Mfa =
  | { step: "checking" }
  | { step: "ok" }
  | { step: "verify"; factorId: string }
  | { step: "enroll"; factorId: string; uri: string; secret: string };

/**
 * Staff sign-in: email + password, then a 6-digit code from an authenticator
 * app (2-step login). The database refuses staff actions without step two.
 */
export function StaffGate({
  roles,
  title,
  dark,
  children,
}: {
  roles: StaffRole[];
  title: string;
  dark?: boolean;
  children: (staff: StaffMember) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffMember | null | undefined>(undefined);
  const [mfa, setMfa] = useState<Mfa>({ step: "checking" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      if (session === null) setStaff(null);
      return;
    }
    supabase()
      .from("staff")
      .select("user_id, role, venue_id, name")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setStaff((data as StaffMember) ?? null));
  }, [session]);

  const checkMfa = useCallback(async () => {
    const sb = supabase();
    const { data: settings } = await sb.from("app_settings").select("require_staff_mfa").maybeSingle();
    if (settings && settings.require_staff_mfa === false) return setMfa({ step: "ok" });

    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") return setMfa({ step: "ok" });

    const { data: factors } = await sb.auth.mfa.listFactors();
    const verified = factors?.totp?.[0];
    if (verified) return setMfa({ step: "verify", factorId: verified.id });

    // First time: clear any half-finished setup, then start a fresh one.
    for (const f of factors?.all ?? []) {
      if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: enrolled, error } = await sb.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `SportsAura ${new Date().toISOString().slice(0, 10)}`,
      issuer: "SportsAura",
    });
    if (error || !enrolled) {
      setError(error?.message ?? "Couldn't start 2-step setup. Reload to try again.");
      return;
    }
    setMfa({ step: "enroll", factorId: enrolled.id, uri: enrolled.totp.uri, secret: enrolled.totp.secret });
  }, []);

  useEffect(() => {
    if (staff && roles.includes(staff.role)) checkMfa();
  }, [staff, roles, checkMfa]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("Email or password is wrong.");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (mfa.step !== "verify" && mfa.step !== "enroll") return;
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId: mfa.factorId, code });
    setBusy(false);
    setCode("");
    if (error) return setError("That code didn't match. Use the current 6-digit code from your authenticator app.");
    setMfa({ step: "ok" });
  }

  const shell = dark ? "min-h-dvh bg-[#0E1716] text-white" : "staff min-h-dvh";
  const card = "w-full max-w-sm rounded-xl border border-[#d8dedb] bg-white p-6 text-[#17201f] shadow-sm";

  if (session === undefined || (session && staff === undefined)) return <div className={shell} />;

  if (!session) {
    return (
      <div className={`${shell} staff flex items-center justify-center px-4`}>
        <form onSubmit={login} className={card}>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-[#5b6865]">Staff sign in</p>
          <div className="mt-5 flex flex-col gap-3">
            <label>
              Email
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="btn btn-dark mt-2" disabled={busy}>
              {busy ? "Signing in" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!staff || !roles.includes(staff.role)) {
    return (
      <div className="staff flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg font-semibold">This account doesn&apos;t have access to the {title}.</p>
        <button className="btn btn-line" onClick={() => supabase().auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  if (mfa.step === "checking") {
    return (
      <div className={`${shell} flex items-center justify-center px-4`}>
        {error ? <p className="text-red-600">{error}</p> : <span className="text-sm opacity-60">Checking 2-step login</span>}
      </div>
    );
  }

  if (mfa.step === "verify" || mfa.step === "enroll") {
    return (
      <div className="staff flex min-h-dvh items-center justify-center px-4 py-10">
        <form onSubmit={submitCode} className={card}>
          <h1 className="text-2xl font-bold">{mfa.step === "enroll" ? "Set up 2-step login" : "Enter your 2-step code"}</h1>
          {mfa.step === "enroll" ? (
            <>
              <p className="mt-2 text-sm text-[#3b4745]">
                Staff accounts need a second step. Open an authenticator app (Google Authenticator, Microsoft
                Authenticator or Authy), add an account, and scan this code.
              </p>
              <div className="mx-auto my-4 w-fit rounded-lg border border-[#d8dedb] bg-white p-3" role="img" aria-label="2-step login QR code">
                <QRCodeSVG value={mfa.uri} size={176} level="M" />
              </div>
              <p className="text-xs text-[#5b6865]">Can&apos;t scan? Enter this key in the app instead:</p>
              <p className="tabular mt-1 break-all rounded-md bg-[#f1f5f3] px-3 py-2 font-mono text-sm" data-testid="mfa-secret">
                {mfa.secret}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-[#3b4745]">Open your authenticator app and type the 6-digit code for SportsAura.</p>
          )}
          <label className="mt-4">
            6-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="tabular !text-center !text-2xl !tracking-[0.4em]"
            />
          </label>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <button className="btn btn-dark mt-4 w-full" disabled={busy || code.length !== 6}>
            {busy ? "Checking" : mfa.step === "enroll" ? "Turn on 2-step login" : "Continue"}
          </button>
          <button type="button" className="mt-3 w-full text-sm text-[#5b6865] underline" onClick={() => supabase().auth.signOut()}>
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return <>{children(staff)}</>;
}
