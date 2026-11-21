"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LAST_VENUE_KEY } from "@/components/AppNav";

export function HomeHub() {
  const [name, setName] = useState<string | null>(null);
  const [venue, setVenue] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      sb.from("users").select("display_name").eq("id", id).maybeSingle().then(({ data: u }) => setName(u?.display_name ?? null));
    });
    let slug: string | null = null;
    try {
      slug = localStorage.getItem(LAST_VENUE_KEY);
    } catch {
      /* private mode */
    }
    if (slug)
      sb.from("venues").select("slug, name").eq("slug", slug).eq("is_active", true).maybeSingle().then(({ data }) => setVenue(data ?? null));
  }, []);

  return (
    <>
      <p className="mt-6 text-lg text-ink/75">{name ? `Hi ${name}. What are we playing?` : "Free to play. No app to download, nothing to buy."}</p>

      <Link href="/live" className="mt-6 block rounded-3xl bg-brand p-6 text-on-brand">
        <span className="text-sm font-semibold uppercase tracking-widest opacity-80">Live at a bar</span>
        <span className="mt-1 block font-display text-4xl font-bold leading-none">
          {venue ? `Back to ${venue.name}` : "Play the match live"}
        </span>
        <span className="mt-2 block text-[15px] opacity-85">
          {venue ? "Pick up where you left off." : "Scan the code on the bar’s TV, call the next play, win rewards."}
        </span>
      </Link>

      <Link href="/play" className="mt-4 block rounded-3xl border border-ink/15 bg-black/20 p-6">
        <span className="text-sm font-semibold uppercase tracking-widest text-brand">Trivia rooms</span>
        <span className="mt-1 block font-display text-4xl font-bold leading-none">Play with friends</span>
        <span className="mt-2 block text-[15px] text-ink/70">Make a room, share the code, play anywhere. Plus a daily quiz.</span>
      </Link>

      <Link href="/wallet" className="mt-4 flex items-center justify-between rounded-2xl border border-ink/15 px-5 py-4">
        <span className="font-display text-2xl font-bold">My rewards</span>
        <span aria-hidden className="text-2xl text-brand">›</span>
      </Link>
    </>
  );
}
