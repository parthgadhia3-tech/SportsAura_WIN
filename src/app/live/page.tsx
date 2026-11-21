"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { themeVars } from "@/lib/theme";
import { AppNav, LAST_VENUE_KEY } from "@/components/AppNav";
import { Spinner } from "@/components/patron/ui";

type Venue = { name: string; slug: string; city: string | null; address: string | null };

export default function LivePage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [last, setLast] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let slug: string | null = null;
    try {
      slug = localStorage.getItem(LAST_VENUE_KEY);
    } catch {
      /* private mode */
    }
    const params = new URLSearchParams(window.location.search);
    if (slug && !params.has("pick")) {
      router.replace(`/v/${slug}${window.location.search}`);
      return;
    }
    setLast(slug);
    supabase()
      .from("venues")
      .select("name, slug, city, address")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setVenues((data as Venue[]) ?? []));
  }, [router]);

  return (
    <div className="brand-canvas min-h-dvh" style={themeVars(null)}>
      <main className="mx-auto max-w-md px-5 pb-32 pt-[max(2rem,env(safe-area-inset-top))]">
        <p className="font-display text-lg font-bold uppercase tracking-widest text-brand">Live at a bar</p>
        <h1 className="mt-2 font-display text-5xl font-bold leading-[0.95]">Scan the code on the bar’s TV</h1>
        <p className="mt-4 text-[17px] text-ink/75">
          Open your phone camera and point it at the QR code on the TV or on your table’s coaster. You’ll be playing in seconds.
        </p>

        <h2 className="mt-10 font-display text-2xl font-bold">Or pick your bar</h2>
        {last === undefined || venues === null ? (
          <Spinner />
        ) : venues.length === 0 ? (
          <p className="mt-3 text-ink/70">No bars are live yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {venues.map((v) => (
              <li key={v.slug}>
                <Link
                  href={`/v/${v.slug}`}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-4 ${v.slug === last ? "border-brand bg-brand/10" : "border-ink/15"}`}
                >
                  <span>
                    <span className="block font-display text-2xl font-bold">{v.name}</span>
                    <span className="text-sm text-ink/65">{[v.address, v.city].filter(Boolean).join(", ")}</span>
                  </span>
                  <span aria-hidden className="text-2xl text-brand">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-sm text-ink/60">You’ll be asked to confirm you’re at the bar before you can play.</p>
      </main>
      <AppNav />
    </div>
  );
}
