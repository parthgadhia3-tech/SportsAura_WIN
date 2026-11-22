"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { POINTS_PER_ANSWER, friendlyError } from "@/lib/copy";
import type { Match, Question, Sponsor } from "@/lib/types";
import { Celebration } from "./Celebration";
import { ErrorNote } from "./ui";

type AnswerRow = { question_id: string; selected_option: number; is_correct: boolean | null; points_awarded: number };
type SponsorLite = Pick<Sponsor, "id" | "name" | "logo_url" | "tagline" | "link_url">;

const Q_COLUMNS = "id, match_id, prompt, options, correct_option, answer_window_s, status, pushed_at, locks_at, resolved_at, created_at, sponsor_id";
const SEEN_KEY = "md-celebrated";

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
  } catch {
    return [];
  }
}
function markSeen(id: string) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...readSeen(), id].slice(-200)));
  } catch {
    /* storage unavailable: the celebration may show once more, harmless */
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remaining / total));
  const urgent = remaining <= 5;
  return (
    <div className="relative size-24 shrink-0" aria-label={`${Math.ceil(remaining)} seconds left`} role="timer">
      <svg viewBox="0 0 110 110" className="size-full -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="9" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={urgent ? "var(--brand-secondary)" : "var(--brand-primary)"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center font-display text-4xl font-bold">{Math.ceil(remaining)}</span>
    </div>
  );
}

/** The live question, your answers so far, and the result of each. */
export function PlayTab({ match, onPointsChanged }: { match: Match; onPointsChanged: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerRow>>({});
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<Record<string, SponsorLite>>({});
  const [error, setError] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const pendingRef = useRef(false);

  const fetchAll = useCallback(async () => {
    const sb = supabase();
    const { data: qs } = await sb
      .from("questions")
      .select(Q_COLUMNS)
      .eq("match_id", match.id)
      .neq("status", "draft")
      .order("pushed_at", { ascending: false })
      .limit(40);
    const list = (qs as Question[]) ?? [];
    setQuestions(list);

    const sIds = [...new Set([...list.map((q) => q.sponsor_id), match.sponsor_id].filter(Boolean))] as string[];
    if (sIds.length) {
      const { data: sp } = await sb.from("sponsors").select("id, name, logo_url, tagline, link_url").in("id", sIds);
      setSponsors(Object.fromEntries(((sp as SponsorLite[]) ?? []).map((x) => [x.id, x])));
    }

    const ids = list.map((q) => q.id);
    if (ids.length) {
      const { data: as } = await sb.from("answers").select("question_id, selected_option, is_correct, points_awarded").in("question_id", ids);
      setAnswers(Object.fromEntries(((as as AnswerRow[]) ?? []).map((a) => [a.question_id, a])));
    }
  }, [match.id, match.sponsor_id]);

  const load = useCallback(async () => {
    // If an update lands mid-fetch, run once more afterwards so nothing is missed.
    if (loadingRef.current) {
      pendingRef.current = true;
      return;
    }
    loadingRef.current = true;
    try {
      do {
        pendingRef.current = false;
        await fetchAll();
      } while (pendingRef.current);
    } finally {
      loadingRef.current = false;
    }
  }, [fetchAll]);

  // Initial load, realtime updates, and a refresh when the phone wakes up.
  useEffect(() => {
    load();
    const sb = supabase();
    const channel = sb
      .channel(`questions-${match.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `match_id=eq.${match.id}` }, () => load())
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sb.removeChannel(channel);
    };
  }, [load, match.id]);

  const live = questions.find((q) => q.status === "live" || q.status === "locked");
  const now = useNow(Boolean(live));

  // Light polling while a question is open, in case a realtime message is missed.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [live, load]);

  // Celebrate each newly resolved right answer exactly once.
  useEffect(() => {
    if (celebrate) return;
    const seen = readSeen();
    const win = questions.find((q) => q.status === "resolved" && answers[q.id]?.is_correct && !seen.includes(q.id));
    if (!win) return;
    setCelebrate(win.id);
    onPointsChanged();
  }, [questions, answers, celebrate, onPointsChanged]);

  // Points also change when an answer turns out wrong or a question is voided.
  const resolvedCount = questions.filter((q) => q.status === "resolved" || q.status === "void").length;
  useEffect(() => {
    if (resolvedCount) onPointsChanged();
  }, [resolvedCount, onPointsChanged]);

  async function answer(q: Question, option: number) {
    setSending(q.id);
    setError("");
    setAnswers((a) => ({ ...a, [q.id]: { question_id: q.id, selected_option: option, is_correct: null, points_awarded: 0 } }));
    const { error } = await supabase().rpc("submit_prediction", { p_question_id: q.id, p_option: option });
    setSending(null);
    if (error) {
      setAnswers((a) => {
        const next = { ...a };
        if (!error.message.includes("already_answered")) delete next[q.id];
        return next;
      });
      setError(friendlyError(error));
    }
  }

  const history = useMemo(() => questions.filter((q) => q.status === "resolved" || q.status === "void"), [questions]);
  const recent =
    !live && history[0]?.status === "resolved" && history[0].resolved_at && now - new Date(history[0].resolved_at).getTime() < 90_000 ? history[0] : null;
  const card = live ?? recent;
  const cardSponsor = card ? sponsors[card.sponsor_id ?? ""] ?? sponsors[match.sponsor_id ?? ""] : undefined;
  const right = history.filter((q) => answers[q.id]?.is_correct).length;
  const answered = history.filter((q) => q.status === "resolved" && answers[q.id]).length;

  return (
    <div className="flex flex-col gap-5 px-5 pb-6 pt-3">
      <AnimatePresence mode="wait">
        {match.status === "ended" ? (
          <motion.div key="ended" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-ink/15 px-6 py-10 text-center">
            <p className="font-display text-3xl font-bold">That&apos;s full time</p>
            <p className="mt-2 text-[17px] text-ink/70">The match has ended. Your points are final. Check where you finished in Leaderboard.</p>
          </motion.div>
        ) : card ? (
          <QuestionCard key={card.id + card.status} q={card} now={now} mine={answers[card.id]} sending={sending === card.id} onAnswer={(i) => answer(card, i)} sponsor={cardSponsor} />
        ) : (
          <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-ink/15 px-6 py-12 text-center">
            <span className="mx-auto mb-4 block size-3 animate-pulse rounded-full bg-brand" aria-hidden />
            <p className="font-display text-3xl font-bold">Next question coming up</p>
            <p className="mt-2 text-[17px] text-ink/70">Keep this screen open. Questions pop up here during the match.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <ErrorNote>{error}</ErrorNote>

      {history.length > 0 && (
        <section aria-labelledby="so-far">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="so-far" className="font-display text-xl font-semibold text-ink/85">
              This match
            </h2>
            <span className="text-sm text-ink/65">
              {right} of {answered} right
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-ink/10 rounded-2xl bg-surface/70">
            {history.slice(0, 15).map((q) => {
              const a = answers[q.id];
              const result = q.status === "void" ? "Cancelled" : !a ? "Missed" : a.is_correct ? `+${a.points_awarded}` : "0";
              return (
                <li key={q.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{q.prompt}</p>
                    {q.correct_option != null && <p className="truncate text-sm text-ink/60">Answer: {q.options[q.correct_option]}</p>}
                  </div>
                  <span className={`tabular shrink-0 font-display text-xl font-bold ${a?.is_correct ? "text-brand" : "text-ink/50"}`}>{result}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <AnimatePresence>
        {celebrate && (
          <Celebration
            points={answers[celebrate]?.points_awarded ?? POINTS_PER_ANSWER}
            onClose={() => {
              markSeen(celebrate);
              setCelebrate(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function QuestionCard({
  q,
  now,
  mine,
  sending,
  onAnswer,
  sponsor,
}: {
  q: Question;
  now: number;
  mine?: AnswerRow;
  sending: boolean;
  onAnswer: (i: number) => void;
  sponsor?: SponsorLite;
}) {
  const remaining = q.locks_at ? (new Date(q.locks_at).getTime() - now) / 1000 : 0;
  const open = q.status === "live" && remaining > 0;
  const resolved = q.status === "resolved";

  let status = "";
  if (resolved) status = mine ? (mine.is_correct ? `You called it: +${mine.points_awarded} points` : "Not this time") : "Result is in";
  else if (mine) status = "Locked in. Result after the play.";
  else if (!open) status = "Answers closed. Result after the play.";

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-3xl bg-surface/90 p-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,.6)]"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-brand-2">{POINTS_PER_ANSWER} points</p>
          <h2 className="mt-1 font-display text-[2rem] font-bold leading-[1.04]">{q.prompt}</h2>
        </div>
        {open && q.locks_at && <CountdownRing remaining={remaining} total={q.answer_window_s} />}
      </div>

      <div className={`mt-5 grid gap-3 ${q.options.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {q.options.map((opt, i) => {
          const picked = mine?.selected_option === i;
          const correct = resolved && q.correct_option === i;
          const wrongPick = resolved && picked && !correct;
          let tone = "border-ink/20 bg-black/20 text-ink";
          if (picked && !resolved) tone = "border-brand bg-brand text-on-brand";
          if (correct) tone = "border-brand bg-brand text-on-brand";
          if (wrongPick) tone = "border-ink/30 bg-transparent text-ink/50 line-through";
          return (
            <button
              key={i}
              disabled={!open || Boolean(mine) || sending}
              onClick={() => onAnswer(i)}
              aria-pressed={picked}
              className={`min-h-16 rounded-2xl border-2 px-4 py-3 text-left font-display text-2xl font-semibold transition active:scale-[.97] disabled:cursor-default ${tone} ${
                !open && !picked && !correct ? "opacity-60" : ""
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {status && <p className="mt-4 text-center text-[17px] font-medium text-ink/80">{status}</p>}

      {sponsor && (
        <a
          href={sponsor.link_url ?? undefined}
          target="_blank"
          rel="noopener sponsored"
          className="mt-4 flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2"
          onClick={(e) => !sponsor.link_url && e.preventDefault()}
        >
          {sponsor.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sponsor.logo_url} alt="" className="size-9 shrink-0 rounded bg-white object-contain" />
          )}
          <span className="min-w-0 text-sm">
            <span className="block text-ink/60">Brought to you by</span>
            <span className="block truncate font-semibold">
              {sponsor.name}
              {sponsor.tagline ? <span className="font-normal text-ink/70"> · {sponsor.tagline}</span> : null}
            </span>
          </span>
        </a>
      )}
    </motion.article>
  );
}
