"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ErrorNote, PrimaryButton } from "@/components/patron/ui";
import { MODES, PlayShell, playError, type Mode } from "./shared";

type Cat = { id: string; name: string; emoji: string };

export function CreateRoom() {
  return <PlayShell>{({ profile }) => <Form hostName={profile.display_name} />}</PlayShell>;
}

const suggest = (name: string) =>
  (name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12) || "ROOM") + "-" + Math.floor(10 + Math.random() * 89);

function Form({ hostName }: { hostName: string }) {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);
  const [ai, setAi] = useState(false);
  const [name, setName] = useState(`${hostName}'s room`);
  const [code, setCode] = useState("");
  const [codeOk, setCodeOk] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("classic");
  const [picked, setPicked] = useState<string[]>([]);
  const [useTopic, setUseTopic] = useState(false);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [seconds, setSeconds] = useState(20);
  const [guests, setGuests] = useState<string[]>(["", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [venue, setVenue] = useState<string | null>(null);

  useEffect(() => {
    setCode(suggest(hostName));
    setVenue(new URLSearchParams(window.location.search).get("venue"));
    supabase().from("trivia_categories").select("id, name, emoji").eq("is_active", true).order("sort_order").then(({ data }) => setCats((data as Cat[]) ?? []));
    fetch("/api/ai/status").then((r) => r.json()).then((d) => setAi(Boolean(d.enabled))).catch(() => setAi(false));
  }, [hostName]);

  // Live check that the code is free
  useEffect(() => {
    if (code.length < 4) return setCodeOk(null);
    const t = setTimeout(() => {
      supabase().rpc("room_code_available", { p_code: code }).then(({ data }) => setCodeOk(Boolean(data)));
    }, 350);
    return () => clearTimeout(t);
  }, [code]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (useTopic && topic.trim().length < 3) return setError("Type a topic, for example “90s Bollywood” or “IPL finals”.");
    if (!useTopic && picked.length === 0) return setError("Pick at least one category.");
    setBusy(true);
    const { data, error } = await supabase().rpc("create_room", {
      p_name: name.trim(),
      p_code: code,
      p_mode: mode,
      p_category_ids: useTopic ? [] : picked,
      p_custom_topic: useTopic ? topic.trim() : null,
      p_count: count,
      p_seconds: seconds,
      p_venue_slug: venue,
      p_guests: mode === "pass" ? guests.map((g) => g.trim()).filter(Boolean) : [],
    });
    setBusy(false);
    if (error) return setError(playError(error));
    router.push(`/play/r/${data}`);
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const chip = (on: boolean) => `rounded-2xl border-2 px-4 py-3 text-left transition ${on ? "border-brand bg-brand/15" : "border-ink/15"}`;

  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-8">
      <Link href="/play" className="text-sm text-ink/70 underline">Back</Link>
      <h1 className="mt-3 font-display text-5xl font-bold leading-none">New room</h1>

      <form onSubmit={create} className="mt-6 flex flex-col gap-7">
        <section className="flex flex-col gap-3">
          <label className="font-semibold">
            Room name
            <input className="mt-1 w-full rounded-xl border border-ink/25 bg-black/25 px-4 py-3 text-lg" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="font-semibold">
            Room code (your friends type this to join)
            <input
              className="tabular mt-1 w-full rounded-xl border border-ink/25 bg-black/25 px-4 py-3 font-display text-2xl font-bold uppercase tracking-widest"
              value={code}
              maxLength={20}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
            />
          </label>
          <p className={`text-sm ${codeOk === false ? "text-red-300" : "text-ink/60"}`}>
            {code.length < 4 ? "At least 4 letters or numbers." : codeOk === false ? "Taken. Try another." : codeOk ? "Available" : "Checking…"}
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-2xl font-bold">Mode</h2>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode">
            {MODES.map((m) => (
              <button type="button" role="radio" aria-checked={mode === m.key} key={m.key} className={chip(mode === m.key)} onClick={() => setMode(m.key)}>
                <span className="text-2xl" aria-hidden>{m.emoji}</span>
                <span className="block font-display text-lg font-bold">{m.name}</span>
                <span className="block text-xs text-ink/65">{m.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        {mode === "pass" && (
          <section>
            <h2 className="mb-1 font-display text-2xl font-bold">Who&apos;s playing?</h2>
            <p className="mb-2 text-sm text-ink/65">You, plus everyone sharing this phone.</p>
            <div className="flex flex-col gap-2">
              {guests.map((g, i) => (
                <input
                  key={i}
                  aria-label={`Player ${i + 2} name`}
                  className="rounded-xl border border-ink/25 bg-black/25 px-4 py-3 text-lg"
                  placeholder={`Player ${i + 2}`}
                  maxLength={24}
                  value={g}
                  onChange={(e) => setGuests(guests.map((x, j) => (j === i ? e.target.value : x)))}
                />
              ))}
              {guests.length < 8 && (
                <button type="button" className="self-start rounded-xl border border-ink/25 px-4 py-2 font-semibold" onClick={() => setGuests([...guests, ""])}>
                  Add player
                </button>
              )}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-display text-2xl font-bold">What to play</h2>
          <div className="mb-3 grid grid-cols-2 rounded-xl bg-black/25 p-1">
            <button type="button" onClick={() => setUseTopic(false)} className={`rounded-lg py-2.5 font-semibold ${!useTopic ? "bg-brand text-on-brand" : "text-ink/70"}`}>Categories</button>
            <button type="button" onClick={() => setUseTopic(true)} className={`rounded-lg py-2.5 font-semibold ${useTopic ? "bg-brand text-on-brand" : "text-ink/70"}`}>Your own topic</button>
          </div>
          {!useTopic ? (
            <div className="grid grid-cols-2 gap-2">
              {cats.map((c) => (
                <button type="button" key={c.id} aria-pressed={picked.includes(c.id)} className={chip(picked.includes(c.id))} onClick={() => toggle(c.id)}>
                  <span className="mr-2" aria-hidden>{c.emoji}</span>
                  <span className="font-semibold">{c.name}</span>
                </button>
              ))}
            </div>
          ) : ai ? (
            <div>
              <input
                aria-label="Topic"
                className="w-full rounded-xl border border-ink/25 bg-black/25 px-4 py-3 text-lg"
                placeholder="90s Bollywood songs, IPL auction history, F1 2026…"
                value={topic}
                maxLength={60}
                onChange={(e) => setTopic(e.target.value)}
              />
              <p className="mt-2 text-sm text-ink/65">
                AI writes the questions when you start, then a second check confirms every answer. Anything it isn&apos;t sure about is left out. Takes about 30 seconds.
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-ink/15 px-4 py-3 text-sm text-ink/70">Custom topics are coming soon. Pick categories for now.</p>
          )}
          {mode === "topics" && !useTopic && <p className="mt-2 text-sm text-ink/65">In Topic wars each player picks their own category in the lobby. These are the choices.</p>}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <label className="font-semibold">
            Questions
            <select className="mt-1 w-full rounded-xl border border-ink/25 bg-black/25 px-3 py-3 text-lg" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {mode !== "speed" ? (
            <label className="font-semibold">
              Time each
              <select className="mt-1 w-full rounded-xl border border-ink/25 bg-black/25 px-3 py-3 text-lg" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                {[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n} seconds</option>)}
              </select>
            </label>
          ) : (
            <p className="self-end pb-3 text-sm text-ink/65">5 seconds each</p>
          )}
        </section>

        <ErrorNote>{error}</ErrorNote>
        <PrimaryButton type="submit" disabled={busy || codeOk === false || code.length < 4}>
          {busy ? "Creating…" : "Create room"}
        </PrimaryButton>
        <p className="text-center text-xs text-ink/55">Free to play. Points have no cash value. Nothing to buy, ever.</p>
      </form>
    </main>
  );
}
