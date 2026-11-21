"use client";

import { useRouter } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { MoreTab } from "@/components/patron/MoreTab";
import { PlayShell } from "@/components/play/shared";

export default function MePage() {
  const router = useRouter();
  return (
    <>
      <PlayShell heading="Your SportsAura account" intro="Sign in with your mobile number to see your profile, your record and your settings.">
        {({ profile }) => (
          <main className="mx-auto max-w-md pb-32 pt-[max(1.5rem,env(safe-area-inset-top))]">
            <h1 className="px-5 font-display text-4xl font-bold">Me</h1>
            <MoreTab profile={profile} onProfile={() => location.reload()} onReplayTour={() => router.push("/live?tour=1")} />
          </main>
        )}
      </PlayShell>
      <AppNav />
    </>
  );
}
