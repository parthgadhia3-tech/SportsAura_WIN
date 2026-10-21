"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import { BUCKET_PUBLIC_COLUMNS, type Bucket, type Match, type Question, type Venue, type WalletCoupon } from "@/lib/types";
import { Celebration } from "./Celebration";
import { ErrorNote } from "./ui";

type AnswerRow = { question_id: string; selected_option: number; is_correct: boolean | null; points_awarded: number };
type BucketLite = Pick<Bucket, "id" | "brand_name" | "title" | "is_alcohol" | "min_age">;

const Q_COLUMNS =
  "id, match_id, venue_id, prompt, options, correct_option, points, coupon_bucket_id, answer_window_s, status, pushed_at, locks_at, resolved_at, created_at";
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
    /* storage unavailable: celebration may repeat once, harmless */
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
    <div className="relative size-28 shrink-0" aria-label={`${Math.ceil(remaining)} seconds left`} role="timer">
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
      <span className="tabular absolute inset-0 flex items-center justify-center font-display text-5xl font-bold">
        {Math.ceil(remaining)}
      </span>
    </div>
  );
}

export function PlayTab({
  venue,
  match,
  onPointsChanged,
  onNeedsVerify,
}: {
  venue: Venue;
  match: Match;
  onPointsChanged: () => void;
  onNeedsVerify: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerRow>>({});
  const [buckets, setBuckets] = useState<Record<string, BucketLite>>({});
  const [celebrate, setCelebrate] = useState<{ points: number; coupon: WalletCoupon | null; extra: number; qid: string } | null>(null);
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
      .limit(30);
    const list = ((qs as Question[]) ?? []).filter((q) => !q.venue_id || q.venue_id === venue.id);
    setQuestions(list);

    const ids = list.map((q) => q.id);
    if (ids.length) {
      const { data: as } = await sb
        .from("answers")
        .select("question_id, selected_option, is_correct, points_awarded")
        .in("question_id", ids);
      setAnswers(Object.fromEntries(((as as AnswerRow[]) ?? []).map((a) => [a.question_id, a])));

      const bIds = [...new Set(list.map((q) => q.coupon_bucket_id).filter(Boolean))] as string[];
      if (bIds.length) {
        const { data: bs } = await sb.from("coupon_buckets").select("id, brand_name, title, is_alcohol, min_age").in("id", bIds);
        setBuckets(Object.fromEntries(((bs as BucketLite[]) ?? []).map((b) => [b.id, b])));
      }
    }
  }, [match.id, venue.id]);

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


  // Initial load, realtime updates, and a safety refresh when the phone wakes up.
  useEffect(() => {
    load();
    const sb = supabase();
    const channel = sb
      .channel(`questions-${match.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions", filter: `match_id=eq.${match.id}` },
        () => load(),
      )
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

  // Light polling while something is open, in case a realtime message is missed.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [live, load]);

  // Celebrate each newly resolved correct answer exactly once.
  useEffect(() => {
    if (celebrate) return;
    const seen = readSeen();
    const win = questions.find(
      (q) => q.status === "resolved" && answers[q.id]?.is_correct && !seen.includes(q.id),
    );
    if (!win) return;
    (async () => {
      const { data } = await supabase()
        .from("user_coupons")
        .select(`id, code, issued_at, expires_at, redeemed_at, question_id, coupon_buckets(${BUCKET_PUBLIC_COLUMNS}, set_id)`)
        .eq("question_id", win.id);
      type Won = WalletCoupon & { coupon_buckets: { set_id: string | null } };
      // Show the reward-set coupon first; any bonus is mentioned as "+N more".
      const won = ((data as unknown as Won[] | null) ?? []).sort(
        (a, z) => Number(Boolean(z.coupon_buckets.set_id)) - Number(Boolean(a.coupon_buckets.set_id)),
      );
      setCelebrate({ points: answers[win.id].points_awarded, coupon: won[0] ?? null, extra: Math.max(won.length - 1, 0), qid: win.id });
      onPointsChanged();
    })();
  }, [questions, answers, celebrate, onPointsChanged]);

  async function answer(q: Question, option: number) {
    setSending(q.id);
    setError("");
    setAnswers((a) => ({ ...a, [q.id]: { question_id: q.id, selected_option: option, is_correct: null, points_awarded: 0 } }));
    const { error } = await supabase().rpc("submit_answer", { p_question_id: q.id, p_option: option });
    setSending(null);
    if (error) {
      setAnswers((a) => {
        const next = { ...a };
        if (!error.message.includes("already_answered")) delete next[q.id];
        return next;
      });
      if (error.message.includes("verification_required")) return onNeedsVerify();
      setError(friendlyError(error));
    }
  }

  const history = useMemo(
    () => questions.filter((q) => q.status === "resolved" || q.status === "void").slice(0, 12),
    [questions],
  );
  const recent = !live && history[0]?.status === "resolved" && history[0].resolved_at
    && now - new Date(history[0].resolved_at).getTime() < 90_000 ? history[0] : null;
  const card = live ?? recent;

  return (
    <div className="flex flex-col gap-6 px-5 pb-6 pt-4">
      <AnimatePresence mode="wait">
        {card ? (
          <QuestionCard
            key={card.id + card.status}
            q={card}
            setActive={Boolean(match.reward_set_id)}
            now={now}
            mine={answers[card.id]}
            bucket={card.coupon_bucket_id ? buckets[card.coupon_bucket_id] : undefined}
            sending={sending === card.id}
            onAnswer={(i) => answer(card, i)}
          />
        ) : (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-3xl border border-ink/15 px-6 py-12 text-center"
          >
            <p className="font-display text-3xl font-bold">Next question soon</p>
            <p className="mt-2 text-[17px] text-ink/70">
              Keep this screen open. It appears here the moment the host sends it.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <ErrorNote>{error}</ErrorNote>

      {history.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-ink/80">Earlier tonight</h2>
          <ul className="flex flex-col divide-y divide-ink/10 rounded-2xl bg-surface/70">
            {history.map((q) => {
              const a = answers[q.id];
              const result =
                q.status === "void" ? "Voided" : !a ? "Skipped" : a.is_correct ? `+${a.points_awarded}` : "Missed";
              return (
                <li key={q.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{q.prompt}</p>
                    {q.correct_option != null && (
                      <p className="text-sm text-ink/60">Answer: {q.options[q.correct_option]}</p>
                    )}
                  </div>
                  <span
                    className={`tabular shrink-0 font-display text-xl font-bold ${a?.is_correct ? "text-brand" : "text-ink/50"}`}
                  >
                    {result}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <AnimatePresence>
        {celebrate && (
          <Celebration
            points={celebrate.points}
            coupon={celebrate.coupon}
            extra={celebrate.extra}
            onClose={() => {
              markSeen(celebrate.qid);
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
  bucket,
  setActive,
  sending,
  onAnswer,
}: {
  q: Question;
  now: number;
  mine?: AnswerRow;
  bucket?: BucketLite;
  setActive?: boolean;
  sending: boolean;
  onAnswer: (i: number) => void;
}) {
  const remaining = q.locks_at ? (new Date(q.locks_at).getTime() - now) / 1000 : 0;
  const open = q.status === "live" && remaining > 0;
  const resolved = q.status === "resolved";

  let status = "";
  if (resolved) status = mine ? (mine.is_correct ? "You called it" : "Not this time") : "Result is in";
  else if (mine) status = "Locked in. Result after the play.";
  else if (!open) status = "Predictions closed. Result after the play.";

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
          <p className="font-display text-lg font-semibold text-brand-2">
            {q.points} points{bucket ? ` + ${bucket.title}` : setActive ? " + a reward if you're right" : ""}
          </p>
          <h2 className="mt-1 font-display text-[2.1rem] font-bold leading-[1.02]">{q.prompt}</h2>
          {bucket?.min_age === 25 && (
            <p className="mt-2 text-sm text-ink/60">Reward for players 25 and over.</p>
          )}
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
    </motion.article>
  );
}
