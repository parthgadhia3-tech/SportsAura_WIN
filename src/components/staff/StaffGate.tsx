"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { StaffRole } from "@/lib/types";

export interface StaffMember {
  user_id: string;
  role: StaffRole;
  venue_id: string | null;
  name: string | null;
}

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("Email or password is wrong.");
  }

  const shell = dark ? "min-h-dvh bg-[#0E1716] text-white" : "staff min-h-dvh";

  if (session === undefined || (session && staff === undefined)) {
    return <div className={shell} />;
  }

  if (!session) {
    return (
      <div className={`${shell} staff flex items-center justify-center px-4`}>
        <form onSubmit={login} className="w-full max-w-sm rounded-xl border border-[#d8dedb] bg-white p-6 shadow-sm">
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

  return <>{children(staff)}</>;
}
