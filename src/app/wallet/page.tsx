"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { themeVars } from "@/lib/theme";
import { WalletTab } from "@/components/patron/WalletTab";
import { Spinner } from "@/components/patron/ui";

export default function WalletPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  return (
    <div className="brand-canvas min-h-dvh" style={themeVars(null)}>
      <div className="mx-auto max-w-md">
        <h1 className="px-5 pt-8 font-display text-4xl font-bold">Your wallet</h1>
        {session === undefined ? (
          <Spinner />
        ) : session ? (
          <WalletTab />
        ) : (
          <p className="px-5 py-10 text-[17px] text-ink/75">
            Scan the coaster at your table and sign in with your phone number to see your rewards.
          </p>
        )}
        <p className="px-5 pb-10">
          <Link href="/" className="font-semibold text-brand underline">
            Back to start
          </Link>
        </p>
      </div>
    </div>
  );
}
