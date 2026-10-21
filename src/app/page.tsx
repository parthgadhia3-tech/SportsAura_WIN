import Link from "next/link";
import { APP_NAME } from "@/lib/copy";
import { LegalLinks } from "@/components/LegalLinks";

export default function Home() {
  return (
    <main className="brand-canvas flex min-h-dvh flex-col justify-between px-6 pb-10 pt-16">
      <div className="mx-auto w-full max-w-md">
        <p className="font-display text-2xl font-bold text-brand">{APP_NAME}</p>
        <h1 className="mt-10 font-display text-6xl font-bold leading-[0.92]">
          Scan the coaster on your table to play.
        </h1>
        <p className="mt-5 text-lg text-ink/75">
          Free live predictions during the match. No app to download, nothing to buy.
        </p>
        <Link
          href="/wallet"
          className="mt-10 inline-block rounded-xl border border-ink/25 px-5 py-3 font-semibold"
        >
          Open my wallet
        </Link>
      </div>
      <LegalLinks className="mx-auto mb-4 w-full max-w-md !justify-start" />
      <nav className="mx-auto flex w-full max-w-md gap-5 text-sm text-ink/55" aria-label="Staff">
        <Link href="/venue" className="underline">Venue dashboard</Link>
        <Link href="/admin" className="underline">Game Master</Link>
      </nav>
    </main>
  );
}
