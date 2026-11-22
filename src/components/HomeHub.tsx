"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type M = { id: string; title: string; starts_at: string; status: string };

export function HomeHub() {
  const [name, setName] = useState<string | null>(null);
  const [live, setLive] = useState<M[] | null>(null);
  const [next, setNext] = useState<M | null>(null);
  const [groups, setGroups] = useState<number | null>(null);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      sb.from("users").select("display_name").eq("id", id).maybeSingle().then(({ data: u }) => setName(u?.display_name ?? null));
      sb.rpc("my_groups").then(({ data: g }) => setGroups(((g as unknown[]) ?? []).length));
    });
    sb.from("matches").select("id, title, starts_at, status").eq("status", "live").not("published_at", "is", null).order("starts_at")
      .then(({ data }) => setLive((data as M[]) ?? []));
    sb.from("matches").select("id, title, starts_at, status").eq("status", "scheduled").not("published_at", "is", null)
      .gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle()
      .then(({ data }) => setNext((data as M) ?? null));
  }, []);

  const on = live && live.length > 0;
  return (
    <>
      <p className="mt-6 text-lg text-ink/75">{name ? `Hi ${name}. What are we playing?` : "Free to play, from anywhere. No app to download, nothing to buy."}</p>

      <Link href="/live" className="mt-6 block rounded-3xl bg-brand p-6 text-on-brand">
        <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest opacity-80">
          {on && <span className="size-2 animate-pulse rounded-full bg-current" aria-hidden />}
          {on ? "Live now" : "Live match predictions"}
        </span>
        <span className="mt-1 block font-display text-4xl font-bold leading-none">
          {on ? (live.length === 1 ? live[0].title : `${live.length} matches live`) : "Call the next play"}
        </span>
        <span className="mt-2 block text-[15px] opacity-85">
          {on
            ? "Jump in: 10 points for every right answer."
            : next
              ? `Next: ${next.title}, ${new Date(next.starts_at).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}`
              : "Questions pop up during the match. 10 points for every right answer."}
        </span>
      </Link>

      <Link href="/play" className="mt-4 block rounded-3xl border border-ink/15 bg-black/20 p-6">
        <span className="text-sm font-semibold uppercase tracking-widest text-brand">Trivia rooms</span>
        <span className="mt-1 block font-display text-4xl font-bold leading-none">Play with friends</span>
        <span className="mt-2 block text-[15px] text-ink/70">Make a room, share the code, play anywhere. Plus a daily quiz.</span>
      </Link>

      <Link href="/me" className="mt-4 flex items-center justify-between rounded-2xl border border-ink/15 px-5 py-4">
        <span>
          <span className="block font-display text-2xl font-bold">Your groups</span>
          <span className="block text-sm text-ink/65">
            {groups ? `${groups} ${groups === 1 ? "group" : "groups"}` : "Make a leaderboard for just your friends"}
          </span>
        </span>
        <span aria-hidden className="text-2xl text-brand">›</span>
      </Link>
    </>
  );
}
