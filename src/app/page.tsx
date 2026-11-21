import Link from "next/link";
import { APP_NAME } from "@/lib/copy";
import { LegalLinks } from "@/components/LegalLinks";
import { AppNav } from "@/components/AppNav";
import { HomeHub } from "@/components/HomeHub";

export default function Home() {
  return (
    <>
      <main className="brand-canvas min-h-dvh px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-md">
          <p className="font-display text-3xl font-bold text-brand">{APP_NAME}</p>
          <HomeHub />
          <LegalLinks className="mt-10 !justify-start" />
          <nav className="mt-4 flex gap-5 text-sm text-ink/55" aria-label="Staff">
            <Link href="/venue" className="underline">Venue dashboard</Link>
            <Link href="/admin" className="underline">Game Master</Link>
            <Link href="/partner" className="ml-auto font-semibold text-ink/80 underline">Own a bar?</Link>
          </nav>
        </div>
      </main>
      <AppNav />
    </>
  );
}
