"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ErrorNote, Spinner } from "@/components/patron/ui";
import { LegalLinks } from "@/components/LegalLinks";
import { PlayShell, modeInfo, playError } from "./shared";

type Profile = {
  streak: number;
  best_streak: number;
  today: null | { code: string; status: string; score: number; correct: number; total: number };
  rooms_played: number;
  wins: number;
  recent: { code: string; name: string; mode: string; status: string; players: number }[];
};
type Cat = { id: string; slug: string; name: string; emoji: string; description: string | null };

export function PlayHub() {
  return <PlayShell>{({ profile }) => <Hub name={profile.display_name} />}</PlayShell>;
}

function Hub({ name }: { name: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    sb.rpc("my_play_profile").then(({ data }) => setMe(data as Profile));
    sb.from("trivia_categories").select("id, slug, name, emoji, description").eq("is_active", true).order("sort_order").then(({ data }) => setCats((data as Cat[]) ?? []));
  }, []);

  async function daily() {
    setBusy("daily");
    setError("");
    const { data, error } = await supabase().rpc("start_daily");
    setBusy(null);
    if (error) return setError(playError(error));
    router.push(`/play/r/${data}`);
  }

  async function quick(c: Cat) {
    setBusy(c.id);
    setError("");
    const { data, error } = await supabase().rpc("create_room", {
      p_name: `${c.name} night`, p_code: null, p_mode: "classic", p_category_ids: [c.id], p_custom_topic: null, p_count: 10, p_seconds: 20,
    });
    setBusy(null);
    if (error) return setError(playError(error));
    router.push(`/play/r/${data}`);
  }

  if (!me) return <Spinner label="Loading" />;
  const done = me.today?.status === "finished";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-12 pt-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-display text-2xl font-bold text-brand">SportsAura</Link>
        <span className="text-sm text-ink/70">Hi {name}</span>
      </header>

      <section className="rounded-3xl bg-brand p-6 text-on-brand">
        <p className="text-sm font-semibold uppercase tracking-widest opacity-80">Daily quiz</p>
        <p className="mt-1 font-display text-4xl font-bold leading-none">
          {done ? `${me.today!.correct}/${me.today!.total} today` : "10 questions. 20 seconds each."}
        </p>
        <p className="mt-2 font-semibold">
          {me.streak > 0 ? `🔥 ${me.streak}-day streak${me.best_streak > me.streak ? ` · best ${me.best_streak}` : ""}` : "Start a streak today"}
        </p>
        {done ? (
          <p className="mt-4 text-sm opacity-85">Same questions for everyone. New quiz tomorrow.</p>
        ) : (
          <button className="mt-4 w-full rounded-2xl bg-[#0C2427] py-4 font-display text-2xl font-bold text-white disabled:opacity-60" onClick={daily} disabled={busy === "daily"}>
            {me.today ? "Carry on" : busy === "daily" ? "Opening…" : "Play today's quiz"}
          </button>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Link href="/play/new" className="rounded-2xl bg-surface/90 px-5 py-5 font-display text-2xl font-bold">
          Create a room <span className="block font-sans text-base font-normal text-ink/70">Pick a mode, invite friends with a code</span>
        </Link>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 4) router.push(`/play/r/${code.trim().toUpperCase()}`);
          }}
        >
          <input
            aria-label="Room code"
            className="min-w-0 flex-1 rounded-2xl border border-ink/25 bg-black/25 px-4 py-4 font-display text-2xl font-bold uppercase tracking-widest placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
            placeholder="Enter a room code"
            value={code}
            maxLength={20}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
          />
          <button className="rounded-2xl border-2 border-brand px-5 font-bold text-brand disabled:opacity-40" disabled={code.trim().length < 4}>Join</button>
        </form>
      </section>

      <ErrorNote>{error}</ErrorNote>

      <section>
        <h2 className="mb-2 font-display text-2xl font-bold">Quick play</h2>
        <p className="mb-3 text-sm text-ink/65">One tap makes a room. Share the code with your table.</p>
        <div className="grid grid-cols-2 gap-3">
          {cats.map((c) => (
            <button key={c.id} onClick={() => quick(c)} disabled={busy !== null} className="rounded-2xl bg-surface/70 px-4 py-4 text-left disabled:opacity-60">
              <span className="text-3xl" aria-hidden>{c.emoji}</span>
              <span className="mt-1 block font-display text-xl font-bold">{busy === c.id ? "Making room…" : c.name}</span>
              <span className="block text-xs text-ink/60">{c.description}</span>
            </button>
          ))}
        </div>
      </section>

      {me.recent.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-2xl font-bold">Your rooms</h2>
          <ul className="flex flex-col gap-2">
            {me.recent.map((r) => (
              <li key={r.code}>
                <Link href={`/play/r/${r.code}`} className="flex items-center justify-between rounded-2xl bg-surface/60 px-4 py-3">
                  <span>
                    <span className="block font-semibold">{r.name}</span>
                    <span className="block text-xs text-ink/60">
                      {modeInfo(r.mode).emoji} {modeInfo(r.mode).name} · {r.players} {r.players === 1 ? "player" : "players"} · {r.code}
                    </span>
                  </span>
                  <span className="text-sm text-ink/60">{r.status === "finished" ? "Results" : r.status === "playing" ? "Live" : "Lobby"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-sm text-ink/60">
        {me.rooms_played} rooms played · {me.wins} wins
      </p>
      <p className="rounded-2xl border border-ink/15 px-4 py-3 text-sm text-ink/70">
        At a SportsAura bar? Scan the code on the TV to play live with the whole room and win rewards.
      </p>
      <LegalLinks />
    </main>
  );
}
