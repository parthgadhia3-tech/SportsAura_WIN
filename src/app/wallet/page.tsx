"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { themeVars } from "@/lib/theme";
import { WalletTab } from "@/components/patron/WalletTab";
import { Spinner } from "@/components/patron/ui";
import { AppNav } from "@/components/AppNav";

export default function WalletPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  return (
    <div className="brand-canvas min-h-dvh" style={themeVars(null)}>
      <div className="mx-auto max-w-md pb-32">
        <h1 className="px-5 pt-[max(2rem,env(safe-area-inset-top))] font-display text-4xl font-bold">Rewards</h1>
        {session === undefined ? (
          <Spinner />
        ) : session ? (
          <WalletTab />
        ) : (
          <p className="px-5 py-10 text-[17px] text-ink/75">
            Play at a bar or in a trivia room and sign in with your phone number to see your rewards here.
          </p>
        )}
      </div>
      <AppNav />
    </div>
  );
}
