"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import { PlayShell } from "@/components/play/shared";
import { AppNav } from "@/components/AppNav";
import { Spinner } from "./ui";

/** Opens from a group invite link: sign in if needed, then join the group. */
export function JoinGroup({ code }: { code: string }) {
  return (
    <>
      <PlayShell heading="You're invited to a group" intro={`Sign in with your mobile number to join group ${code} and see its leaderboard.`}>
        {() => <Joiner code={code} />}
      </PlayShell>
      <AppNav />
    </>
  );
}

function Joiner({ code }: { code: string }) {
  const [state, setState] = useState<{ name: string } | { error: string } | null>(null);
  useEffect(() => {
    supabase()
      .rpc("join_group", { p_code: code })
      .then(({ data, error }) => setState(error ? { error: friendlyError(error) } : { name: (data as { name: string }[])[0]?.name ?? code }));
  }, [code]);

  return (
    <main className="mx-auto max-w-md px-6 pb-32 pt-[max(3rem,env(safe-area-inset-top))]">
      {!state ? (
        <Spinner label="Joining the group" />
      ) : "error" in state ? (
        <>
          <h1 className="font-display text-4xl font-bold">Couldn&apos;t join</h1>
          <p className="mt-3 text-[17px] text-ink/75">{state.error}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">Group joined</p>
          <h1 className="mt-2 font-display text-5xl font-bold leading-[0.95]">You&apos;re in {state.name}</h1>
          <p className="mt-3 text-[17px] text-ink/75">
            When a match is live, open Leaderboard and pick {state.name} to see how you stack up against the group.
          </p>
        </>
      )}
      <Link href="/live" className="mt-8 block rounded-2xl bg-brand py-4 text-center font-display text-2xl font-bold text-on-brand">
        Go to Live
      </Link>
    </main>
  );
}
