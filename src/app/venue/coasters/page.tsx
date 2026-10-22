"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { VenueShell } from "@/components/staff/VenueShell";
import type { Venue } from "@/lib/types";

export default function CoastersPage() {
  return <VenueShell title="Table coasters">{({ venue }) => <Coasters venue={venue} />}</VenueShell>;
}

function Coasters({ venue }: { venue: Venue | null }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!venue || !origin) return <main className="p-5 text-white/60">Loading…</main>;
  const n = venue.table_count ?? 0;
  const cards = [{ label: "Any table", url: `${origin}/v/${venue.slug}` }, ...Array.from({ length: n }, (_, i) => ({ label: `Table ${i + 1}`, url: `${origin}/v/${venue.slug}?t=${i + 1}` }))];

  return (
    <main className="p-5 print:p-0">
      <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3 print:hidden">
        <p className="flex-1 text-white/75">
          {n > 0 ? (
            <>Each table coaster opens the game and puts the guest on that table automatically. Print on card and cut along the lines.</>
          ) : (
            <>Table play is off. Set the number of tables on the <Link href="/venue" className="underline">Dashboard</Link> to print a coaster per table.</>
          )}
        </p>
        <button className="rounded-md bg-[#FFB020] px-4 py-2 font-bold text-black" onClick={() => window.print()}>
          Print coasters
        </button>
      </div>
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 print:max-w-none print:grid-cols-3 print:gap-0">
        {cards.map((c) => (
          <div key={c.label} className="flex break-inside-avoid flex-col items-center rounded-2xl border border-dashed border-black/30 bg-[#FBFAF5] p-5 text-center text-[#0C2427] print:rounded-none">
            <p className="font-display text-2xl font-extrabold leading-none">Scan to play free</p>
            <p className="mt-1 text-sm text-[#3E4B49]">Live predictions during the match</p>
            <QRCodeSVG value={c.url} size={170} level="M" marginSize={1} className="my-3" />
            <p className="font-display text-3xl font-extrabold">{c.label}</p>
            <p className="mt-1 text-xs text-[#5E6A68]">{venue.name} · 21+ only · No purchase necessary</p>
          </div>
        ))}
      </div>
    </main>
  );
}
