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
          <nav className="mt-4 text-sm text-ink/45" aria-label="Staff">
            <Link href="/admin" className="underline">Game Master</Link>
          </nav>
        </div>
      </main>
      <AppNav />
    </>
  );
}
