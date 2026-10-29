"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import { ErrorNote, PrimaryButton, Spinner } from "@/components/patron/ui";
import { beep, buzz, modeInfo, PlayShell, playError, playerPost, setSound, soundOn, useClock, useRoom, type RoomPlayer, type RoomState } from "./shared";

const EMOJIS = ["🔥", "😂", "😱", "👏", "🤯", "🙈", "🏏", "🎬"];

export function RoomScreen({ code }: { code: string }) {
  return <PlayShell>{() => <Gate code={code} />}</PlayShell>;
}

/** Opening a room link joins it (once). If that's not possible, show why. */
function Gate({ code }: { code: string }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [why, setWhy] = useState("");
  const [preview, setPreview] = useState<{ name: string; host: string; mode: string } | null>(null);
  useEffect(() => {
    supabase()
      .rpc("join_room", { p_code: code })
      .then(async ({ error }) => {
        if (!error) return setReady(true);
        setWhy(playError(error));
        const { data } = await supabase().rpc("room_preview", { p_code: code });
        setPreview(data as typeof preview);
        setReady(false);
      });
  }, [code]);
  if (ready === null) return <Spinner label="Joining room" />;
  if (!ready)
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="font-display text-5xl font-bold">{preview?.name ?? code}</p>
        {preview && <p className="mt-2 text-ink/70">Hosted by {preview.host} · {modeInfo(preview.mode).name}</p>}
        <p className="mt-6 rounded-2xl bg-surface/70 px-4 py-4 text-lg">{why}</p>
        <Link href="/play" className="mt-8 inline-block rounded-2xl border border-ink/25 px-6 py-3 font-semibold">Go to Play</Link>
      </main>
    );
  return <Room code={code} />;
}

function Room({ code }: { code: string }) {
  const { state, error, tick, now } = useRoom(code);
  useClock(200);
  const [sound, setSoundState] = useState(true);
  useEffect(() => setSoundState(soundOn()), []);

  // Sounds and buzzes on game events
  const last = useRef<{ idx: number; revealed: boolean; status: string }>({ idx: -1, revealed: false, status: "" });
  useEffect(() => {
    if (!state) return;
    const c = state.current;
    const prev = last.current;
    if (state.status === "playing" && c && c.idx !== prev.idx) beep("start");
    if (c?.revealed && !(prev.idx === c.idx && prev.revealed)) {
      const mine = c.mine?.find((m) => m.player_id === state.me) ?? c.mine?.[0];
      if (mine?.is_correct) {
        beep("right");
        buzz(60);
      } else if (mine) {
        beep("wrong");
        buzz([40, 60, 40]);
      }
    }
    if (state.status === "finished" && prev.status === "playing" && state.players[0]?.is_me) beep("win");
    last.current = { idx: c?.idx ?? -1, revealed: Boolean(c?.revealed), status: state.status };
  }, [state]);

  if (!state) return error ? <p className="p-8 text-center">{playError(error)}</p> : <Spinner label="Loading room" />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-28 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link href="/play" className="text-sm text-ink/70 underline">Play</Link>
        <p className="min-w-0 flex-1 truncate text-center font-display text-xl font-bold">{state.name}</p>
        <button
          className="rounded-lg border border-ink/20 px-2 py-1 text-sm"
          aria-pressed={sound}
          onClick={() => {
            setSound(!sound);
            setSoundState(!sound);
          }}
        >
          {sound ? "Sound on" : "Muted"}
        </button>
      </header>

      {state.status === "lobby" && <Lobby s={state} refresh={tick} />}
      {state.status === "playing" && state.current && <Live s={state} now={now} refresh={tick} />}
      {state.status === "finished" && <Results s={state} />}

      {!state.solo && state.mode !== "pass" && state.status !== "finished" && <Reactions s={state} />}
    </main>
  );
}

// ---------------------------------------------------------------- lobby
function Lobby({ s, refresh }: { s: RoomState; refresh: () => void }) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState("");
  const [link, setLink] = useState("");
  const [cats, setCats] = useState<{ id: string; name: string; emoji: string }[]>([]);
  useEffect(() => setLink(`${window.location.origin}/play/r/${s.code}`), [s.code]);
  useEffect(() => {
    if (s.mode !== "topics") return;
    if (s.categories.length) return setCats(s.categories);
    supabase().from("trivia_categories").select("id, name, emoji").eq("is_active", true).order("sort_order").then(({ data }) => setCats(data ?? []));
  }, [s.mode, s.categories]);
  const me = s.players.find((p) => p.is_me);
  const mi = modeInfo(s.mode);
  const msg = `Join my SportsAura trivia room "${s.name}". Code ${s.code}: ${link}`;

  async function start() {
    setError("");
    if (s.custom_topic) {
      const steps = [`Writing questions about “${s.custom_topic}”…`, "Fact-checking every answer a second time…", "Throwing out anything we're not sure about…", "Nearly there…"];
      let i = 0;
      setPreparing(steps[0]);
      const t = setInterval(() => setPreparing(steps[Math.min(++i, steps.length - 1)]), 7000);
      const { ok, body } = await playerPost("/api/trivia/topic", { code: s.code });
      clearInterval(t);
      setPreparing("");
      if (!ok) return setError(String(body.error ?? "Couldn't prepare questions."));
    }
    const { error } = await supabase().rpc("start_room", { p_code: s.code });
    if (error) return setError(playError(error));
    refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl bg-surface/80 p-5 text-center">
        <p className="text-sm text-ink/70">{mi.emoji} {mi.name}{s.custom_topic ? ` · ${s.custom_topic}` : s.categories.length ? ` · ${s.categories.map((c) => c.name).join(", ")}` : ""}</p>
        <p className="mt-3 text-sm uppercase tracking-widest text-ink/60">Room code</p>
        <p className="tabular font-display text-5xl font-extrabold tracking-widest text-brand">{s.code}</p>
        {s.mode !== "pass" && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <a className="rounded-xl bg-[#25D366] py-3 font-semibold text-black" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">WhatsApp</a>
            <button
              className="rounded-xl border border-ink/25 py-3 font-semibold"
              onClick={async () => {
                try {
                  if (navigator.share) await navigator.share({ title: s.name, text: msg, url: link });
                  else {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  }
                } catch {
                  /* cancelled */
                }
              }}
            >
              {copied ? "Copied" : "Share link"}
            </button>
            <button className="rounded-xl border border-ink/25 py-3 font-semibold" onClick={() => setShowQr(!showQr)}>{showQr ? "Hide QR" : "Show QR"}</button>
          </div>
        )}
        {showQr && link && (
          <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
            <QRCodeSVG value={link} size={200} level="M" />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-display text-2xl font-bold">
          {s.players.length} {s.players.length === 1 ? "player" : "players"} {s.mode !== "pass" && s.players.length < 2 ? "· waiting for friends" : ""}
        </h2>
        {s.mode === "teams" ? (
          <div className="grid grid-cols-2 gap-3">
            {(["A", "B"] as const).map((t) => (
              <div key={t} className="rounded-2xl bg-surface/60 p-3">
                <p className="mb-2 font-display text-xl font-bold">Team {t}</p>
                {s.players.filter((p) => p.team === t).map((p) => (
                  <PlayerChip key={p.id} p={p} />
                ))}
                {me && me.team !== t && (
                  <button className="mt-2 w-full rounded-xl border border-ink/25 py-2 text-sm font-semibold" onClick={async () => { await supabase().rpc("set_room_team", { p_code: s.code, p_player: me.id, p_team: t }); refresh(); }}>
                    Join team {t}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {s.players.map((p) => <PlayerChip key={p.id} p={p} />)}
          </div>
        )}
      </section>

      {s.mode === "topics" && me && (
        <section>
          <h2 className="mb-2 font-display text-2xl font-bold">Your category</h2>
          <div className="grid grid-cols-2 gap-2">
            {cats.map((c) => (
              <button
                key={c.id}
                aria-pressed={me.topic === c.id}
                className={`rounded-2xl border-2 px-3 py-3 text-left font-semibold ${me.topic === c.id ? "border-brand bg-brand/15" : "border-ink/15"}`}
                onClick={async () => { await supabase().rpc("set_my_topic", { p_code: s.code, p_category: c.id }); refresh(); }}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <ErrorNote>{error}</ErrorNote>
      {preparing && <p className="rounded-2xl bg-surface/70 px-4 py-4 text-center font-semibold" role="status">{preparing}</p>}
      {s.is_host ? (
        <PrimaryButton onClick={start} disabled={Boolean(preparing)}>
          {preparing ? "Preparing…" : s.mode === "pass" ? "Start" : `Start game${s.players.length > 1 ? "" : " (you can start alone)"}`}
        </PrimaryButton>
      ) : (
        <p className="text-center text-ink/70">Waiting for the host to start…</p>
      )}
    </div>
  );
}

function PlayerChip({ p }: { p: RoomPlayer }) {
  return (
    <span className={`mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold ${p.is_me ? "bg-brand text-on-brand" : "bg-black/25"}`}>
      {p.name}
      {p.is_host && <span className="opacity-70">· host</span>}
    </span>
  );
}

// ---------------------------------------------------------------- live question
function Live({ s, now, refresh }: { s: RoomState; now: () => number; refresh: () => void }) {
  const c = s.current!;
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState("");
  const t = now();
  const start = new Date(c.started_at).getTime();
  const lock = new Date(c.locks_at).getTime();
  const countdown = Math.ceil((start - t) / 1000);
  const left = Math.max(0, (lock - t) / 1000);
  const open = !c.revealed && t >= start && t < lock;
  const hot = s.players.find((p) => p.id === c.hot_player_id);
  const iAmHot = Boolean(hot && hot.id === s.me);
  const answerFor = s.mode === "pass" ? hot?.id : s.me;
  const mine = c.mine?.find((m) => m.player_id === answerFor) ?? null;
  const myResult = c.mine?.find((m) => m.player_id === s.me) ?? null;
  const tickRef = useRef(-1);
  useEffect(() => setReported(""), [c.idx]);
  useEffect(() => {
    const sec = Math.ceil(left);
    if (open && sec <= 3 && sec > 0 && tickRef.current !== sec) {
      tickRef.current = sec;
      beep("tick");
    }
  }, [left, open]);

  async function answer(option: number | null, predict: boolean | null = null) {
    setError("");
    buzz(20);
    const { error } = await supabase().rpc("room_answer", {
      p_code: s.code,
      p_option: option,
      p_player: s.mode === "pass" ? hot?.id : null,
      p_predict: predict,
    });
    if (error) setError(playError(error));
    refresh();
  }

  async function report(reason: string) {
    const { data, error } = await supabase().rpc("report_question", { p_code: s.code, p_idx: c.idx, p_reason: reason });
    setReporting(false);
    if (error) return setReported(playError(error));
    setReported((data as { pulled: boolean }).pulled ? "Thanks. Two players flagged it, so it's been pulled and doesn't count." : "Thanks, we'll check it. One more report pulls it straight away.");
    refresh();
  }

  if (countdown > 0)
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-ink/70">Question {c.idx + 1} of {s.total}</p>
        <motion.p key={countdown} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="tabular font-display text-[9rem] font-extrabold leading-none text-brand">
          {countdown}
        </motion.p>
        {s.mode === "pass" && hot && <p className="mt-4 font-display text-3xl font-bold">Pass the phone to {hot.name}</p>}
        {s.mode === "hotseat" && hot && <p className="mt-4 font-display text-3xl font-bold">{hot.is_me ? "You're in the hot seat" : `${hot.name} is in the hot seat`}</p>}
      </div>
    );

  const sponsor = c.category?.sponsor;
  const predictMode = s.mode === "hotseat" && !iAmHot;
  const meP = s.players.find((p) => p.is_me);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-ink/70">
        <span>Q{c.idx + 1}/{s.total}{c.category ? ` · ${c.category.emoji} ${c.category.name}` : s.custom_topic ? ` · ${s.custom_topic}` : ""}</span>
        <span className="tabular font-semibold text-ink">{meP?.score ?? 0} pts</span>
      </div>
      {!c.revealed && (
        <div className="h-2 overflow-hidden rounded-full bg-black/25" aria-label={`${Math.ceil(left)} seconds left`} role="timer">
          <div className={`h-full ${left <= 3 ? "bg-brand-2" : "bg-brand"}`} style={{ width: `${(left / s.seconds) * 100}%`, transition: "width 200ms linear" }} />
        </div>
      )}
      {sponsor && <p className="text-xs text-ink/60">This round is brought to you by <strong>{sponsor.name}</strong>{sponsor.tagline ? ` · ${sponsor.tagline}` : ""}</p>}

      {(s.mode === "pass" || s.mode === "hotseat") && hot && !c.revealed && (
        <p className="rounded-xl bg-brand/15 px-3 py-2 text-center font-semibold">
          {s.mode === "pass" ? `${hot.name}'s turn` : iAmHot ? "You're in the hot seat: answer it!" : `${hot.name} is answering. Will they get it right?`}
        </p>
      )}

      <h1 className="font-display text-[2.1rem] font-bold leading-[1.05]">{c.prompt}</h1>

      {predictMode && !c.revealed ? (
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              disabled={!open || Boolean(mine)}
              onClick={() => answer(null, v)}
              className={`min-h-20 rounded-2xl border-2 font-display text-2xl font-bold ${mine?.predict === v ? "border-brand bg-brand text-on-brand" : "border-ink/20 bg-black/20"} disabled:opacity-70`}
            >
              {v ? "They'll get it" : "No chance"}
            </button>
          ))}
          <ul className="col-span-2 flex flex-col gap-1 text-sm text-ink/70">
            {c.options.map((o, i) => <li key={i}>· {o}</li>)}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {c.options.map((o, i) => {
            const picked = mine?.option === i;
            const right = c.revealed && c.correct_option === i;
            const wrongPick = c.revealed && picked && !right;
            let tone = "border-ink/20 bg-black/20";
            if (picked && !c.revealed) tone = "border-brand bg-brand text-on-brand";
            if (right) tone = "border-brand bg-brand text-on-brand";
            if (wrongPick) tone = "border-ink/30 text-ink/50 line-through";
            const blocked = !open || Boolean(mine) || (s.mode === "pass" && !s.is_host) || (s.mode === "hotseat" && !iAmHot);
            return (
              <button
                key={i}
                disabled={blocked}
                onClick={() => answer(i)}
                aria-pressed={picked}
                className={`flex min-h-16 items-center justify-between rounded-2xl border-2 px-4 py-3 text-left font-display text-2xl font-semibold transition active:scale-[.98] ${tone} ${c.revealed && !right && !picked ? "opacity-60" : ""}`}
              >
                <span>{o}</span>
                {c.revealed && c.split && s.players.length > 1 && <span className="tabular text-base opacity-80">{c.split[i]}</span>}
              </button>
            );
          })}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      {!c.revealed ? (
        <p className="text-center text-ink/70">
          {mine ? `Locked in. ${c.answers} of ${s.mode === "pass" ? 1 : s.players.filter((p) => !p.is_guest).length} answered.` : open ? `${Math.ceil(left)} seconds` : "Time's up"}
        </p>
      ) : (
        <AnimatePresence>
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
            {c.voided ? (
              <p className="rounded-2xl bg-surface/80 px-4 py-3 font-semibold">This question was pulled after reports. It doesn&apos;t count for anyone.</p>
            ) : (
              <p className="text-center font-display text-3xl font-bold">
                {myResult?.is_correct
                  ? `+${myResult.points} ${predictMode ? "good call" : "you got it"}`
                  : myResult
                    ? predictMode ? "Wrong call" : "Not this time"
                    : s.mode === "pass" && mine?.is_correct
                      ? `+${mine.points} for ${hot?.name}`
                      : s.mode === "pass" && mine
                        ? `Unlucky, ${hot?.name}`
                        : "No answer"}
              </p>
            )}
            {c.explanation && <p className="rounded-2xl bg-surface/70 px-4 py-3 text-[15px]">{c.explanation}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/60">
              {c.source_url && (
                <a href={c.source_url} target="_blank" rel="noopener" className="underline">Source: {c.source_title || "news"}</a>
              )}
              {c.ai && <span>AI-written, checked twice</span>}
              {!c.voided && !reported && (
                <button className="underline" onClick={() => setReporting(!reporting)}>Wrong answer?</button>
              )}
            </div>
            {reporting && (
              <div className="flex flex-wrap gap-2">
                {["The answer is wrong", "Two answers are right", "Question is unclear"].map((r) => (
                  <button key={r} className="rounded-xl border border-ink/25 px-3 py-2 text-sm" onClick={() => report(r)}>{r}</button>
                ))}
              </div>
            )}
            {reported && <p className="text-sm text-ink/75">{reported}</p>}
            <Standings s={s} top={5} />
            <p className="text-center text-sm text-ink/55">{c.idx + 1 < s.total ? "Next question coming up…" : "Final results coming up…"}</p>
          </motion.section>
        </AnimatePresence>
      )}
    </div>
  );
}

function Standings({ s, top }: { s: RoomState; top: number }) {
  if (s.solo) return null;
  if (s.mode === "teams") {
    const a = s.players.filter((p) => p.team === "A").reduce((n, p) => n + p.score, 0);
    const b = s.players.filter((p) => p.team === "B").reduce((n, p) => n + p.score, 0);
    return (
      <div className="grid grid-cols-2 gap-3">
        {[["A", a], ["B", b]].map(([t, n]) => (
          <div key={t} className={`rounded-2xl px-4 py-3 text-center ${s.players.find((p) => p.is_me)?.team === t ? "bg-brand text-on-brand" : "bg-surface/70"}`}>
            <p className="text-sm">Team {t}</p>
            <p className="tabular font-display text-3xl font-bold">{n}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-1">
      {s.players.slice(0, top).map((p, i) => (
        <li key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${p.is_me ? "bg-brand text-on-brand" : "bg-surface/60"}`}>
          <span className="tabular w-6 font-display text-xl font-bold">{i + 1}</span>
          <span className="flex-1 truncate font-semibold">{p.name}</span>
          <span className="tabular font-display text-xl font-bold">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- results
function titlesFor(players: RoomPlayer[]) {
  const t = new Map<string, string>();
  if (players.length < 2) return t;
  const give = (id: string | undefined, title: string) => id && !t.has(id) && t.set(id, title);
  give(players[0]?.id, "Room champion");
  give([...players].filter((p) => p.correct > 0 && p.avg_ms != null).sort((a, b) => (a.avg_ms ?? 1e9) - (b.avg_ms ?? 1e9))[0]?.id, "Fastest finger");
  give([...players].filter((p) => p.wrong >= 2).sort((a, b) => b.wrong - a.wrong)[0]?.id, "Confidently wrong");
  give([...players].filter((p) => p.answered >= 3).sort((a, b) => b.correct / b.answered - a.correct / a.answered)[0]?.id, "Sharp shooter");
  give(players[players.length - 1]?.id, "Brave effort");
  return t;
}

function Results({ s }: { s: RoomState }) {
  const router = useRouter();
  const titles = useMemo(() => titlesFor(s.players), [s.players]);
  const me = s.players.find((p) => p.is_me);
  const myRank = s.players.findIndex((p) => p.is_me) + 1;
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const teamA = s.players.filter((p) => p.team === "A").reduce((n, p) => n + p.score, 0);
  const teamB = s.players.filter((p) => p.team === "B").reduce((n, p) => n + p.score, 0);

  async function rematch() {
    const { data, error } = await supabase().rpc("rematch_room", { p_code: s.code });
    if (error) return setError(playError(error));
    router.push(`/play/r/${data}`);
  }

  async function share() {
    setSharing(true);
    try {
      const blob = await shareCard(s, titles);
      const file = new File([blob], "sportsaura-result.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: "Think you can beat us? Play free on SportsAura" });
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sportsaura-result.png";
        a.click();
      }
    } catch {
      /* cancelled */
    }
    setSharing(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-3xl bg-brand p-6 text-center text-on-brand">
        {s.solo ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-widest opacity-80">{s.daily ? "Daily quiz done" : "Done"}</p>
            <p className="tabular font-display text-7xl font-extrabold leading-none">{me?.correct ?? 0}/{s.total}</p>
            <p className="mt-2 font-semibold">{me?.score ?? 0} points</p>
          </>
        ) : s.mode === "teams" ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-widest opacity-80">Winner</p>
            <p className="font-display text-6xl font-extrabold leading-none">{teamA === teamB ? "It's a tie!" : `Team ${teamA > teamB ? "A" : "B"}`}</p>
            <p className="mt-2 font-semibold">{teamA} vs {teamB}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold uppercase tracking-widest opacity-80">Champion</p>
            <p className="font-display text-6xl font-extrabold leading-none">{s.players[0]?.name}</p>
            <p className="mt-2 font-semibold">{s.players[0]?.score} points{myRank > 1 && s.mode !== "pass" ? ` · you finished #${myRank}` : ""}</p>
          </>
        )}
      </section>

      {!s.solo && (
        <ol className="flex flex-col gap-2">
          {s.players.map((p, i) => (
            <li key={p.id} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${p.is_me ? "bg-surface" : "bg-surface/60"}`}>
              <span className="tabular w-7 font-display text-2xl font-bold text-brand">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">{p.name}{p.is_me ? " (you)" : ""}{s.mode === "teams" && p.team ? ` · Team ${p.team}` : ""}</span>
                {titles.get(p.id) && <span className="block text-sm text-brand-2">{titles.get(p.id)}</span>}
                <span className="block text-xs text-ink/60">{p.correct} right{p.avg_ms ? ` · ${(p.avg_ms / 1000).toFixed(1)}s average` : ""}</span>
              </span>
              <span className="tabular font-display text-2xl font-bold">{p.score}</span>
            </li>
          ))}
        </ol>
      )}

      <ErrorNote>{error}</ErrorNote>
      <PrimaryButton onClick={share} disabled={sharing}>{sharing ? "Making your card…" : "Share the result"}</PrimaryButton>
      {!s.solo && (s.is_host ? (
        <button className="rounded-2xl border-2 border-brand py-4 font-display text-2xl font-bold text-brand" onClick={rematch}>Rematch</button>
      ) : s.rematch_code ? (
        <Link href={`/play/r/${s.rematch_code}`} className="rounded-2xl border-2 border-brand py-4 text-center font-display text-2xl font-bold text-brand">Join the rematch</Link>
      ) : (
        <p className="text-center text-sm text-ink/60">The host can start a rematch.</p>
      ))}
      <Link href="/play" className="text-center font-semibold text-ink/75 underline">Back to Play</Link>
    </div>
  );
}

/** A 1080x1350 result card for Instagram Story / WhatsApp. */
async function shareCard(s: RoomState, titles: Map<string, string>): Promise<Blob> {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const bg = g.createRadialGradient(W * 0.3, -100, 50, W * 0.5, H * 0.4, H);
  bg.addColorStop(0, "#1F5257");
  bg.addColorStop(0.5, "#0C2427");
  bg.addColorStop(1, "#071517");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  await document.fonts?.ready;
  const font = (w: number, px: number) => `${w} ${px}px "Barlow Condensed", "Barlow", sans-serif`;
  g.fillStyle = "#FFB020";
  g.font = font(800, 64);
  g.fillText("SportsAura", 80, 130);
  g.fillStyle = "#F3F1E8";
  g.font = font(700, 96);
  g.fillText(s.name.slice(0, 22), 80, 260);
  g.fillStyle = "rgba(243,241,232,.7)";
  g.font = font(600, 44);
  g.fillText(`${modeInfo(s.mode).name} · ${s.total} questions${s.custom_topic ? ` · ${s.custom_topic.slice(0, 24)}` : ""}`, 80, 330);
  const me = s.players.find((p) => p.is_me);
  if (s.solo) {
    g.fillStyle = "#FFB020";
    g.font = font(800, 300);
    g.fillText(`${me?.correct ?? 0}/${s.total}`, 80, 720);
    g.fillStyle = "#F3F1E8";
    g.font = font(700, 64);
    g.fillText(s.daily ? "in today's daily quiz" : "right answers", 80, 810);
  } else {
    s.players.slice(0, 5).forEach((p, i) => {
      const y = 470 + i * 150;
      g.fillStyle = i === 0 ? "#FFB020" : "rgba(255,255,255,.08)";
      g.beginPath();
      g.roundRect(70, y - 95, W - 140, 125, 28);
      g.fill();
      g.fillStyle = i === 0 ? "#0C2427" : "#F3F1E8";
      g.font = font(800, 72);
      g.fillText(String(i + 1), 110, y);
      g.font = font(700, 60);
      g.fillText(p.name.slice(0, 16), 200, y - 8);
      const t = titles.get(p.id);
      if (t) {
        g.font = font(600, 34);
        g.fillText(t, 200, y + 22);
      }
      g.font = font(800, 72);
      g.textAlign = "right";
      g.fillText(String(p.score), W - 110, y);
      g.textAlign = "left";
    });
  }
  g.fillStyle = "rgba(243,241,232,.75)";
  g.font = font(600, 46);
  g.fillText("Think you can beat us? Play free:", 80, H - 150);
  g.fillStyle = "#7FE0C8";
  g.font = font(700, 52);
  g.fillText(`${window.location.host}/play`, 80, H - 85);
  return new Promise((res) => cv.toBlob((b) => res(b!), "image/png"));
}

// ---------------------------------------------------------------- reactions
function Reactions({ s }: { s: RoomState }) {
  const [floating, setFloating] = useState<{ id: number; emoji: string; name: string; x: number }[]>([]);
  const seen = useRef(new Set<number>());
  useEffect(() => {
    const fresh = s.reactions.filter((r) => !seen.current.has(r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => seen.current.add(r.id));
    setFloating((f) => [...f, ...fresh.map((r) => ({ ...r, x: 10 + Math.random() * 75 }))]);
    const ids = fresh.map((r) => r.id);
    setTimeout(() => setFloating((f) => f.filter((x) => !ids.includes(x.id))), 2600);
  }, [s.reactions]);
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
        <AnimatePresence>
          {floating.map((r) => (
            <motion.div
              key={r.id}
              initial={{ y: "92vh", opacity: 0, scale: 0.6 }}
              animate={{ y: "35vh", opacity: 1, scale: 1.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2, ease: "easeOut" }}
              className="absolute text-center"
              style={{ left: `${r.x}%` }}
            >
              <span className="block text-5xl">{r.emoji}</span>
              <span className="block text-xs text-ink/80">{r.name}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md justify-between gap-1 border-t border-ink/10 bg-black/55 px-3 pb-[max(.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl" aria-label="Reactions">
        {EMOJIS.map((e) => (
          <button key={e} aria-label={`React ${e}`} className="rounded-xl px-1.5 py-1 text-2xl active:scale-90" onClick={() => supabase().rpc("room_react", { p_code: s.code, p_emoji: e })}>
            {e}
          </button>
        ))}
      </nav>
    </>
  );
}
