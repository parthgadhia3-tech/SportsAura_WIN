"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import { BUCKET_PUBLIC_COLUMNS, type Bucket, type Match, type Question, type Sponsor, type Venue, type WalletCoupon } from "@/lib/types";
import { Celebration } from "./Celebration";
import { ErrorNote } from "./ui";
import { LegalLinks } from "@/components/LegalLinks";

type AnswerRow = { question_id: string; selected_option: number; is_correct: boolean | null; points_awarded: number; is_double: boolean; bonus_points: number };
type Me = { table_no: number | null; streak: number; best_streak: number; double_used: boolean };
type SponsorLite = Pick<Sponsor, "id" | "name" | "logo_url" | "tagline" | "link_url">;
type BucketLite = Pick<Bucket, "id" | "brand_name" | "title" | "is_alcohol" | "min_age">;

const Q_COLUMNS =
  "id, match_id, venue_id, prompt, options, correct_option, points, coupon_bucket_id, answer_window_s, status, pushed_at, locks_at, resolved_at, created_at, sponsor_id";
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
  tableHint,
}: {
  venue: Venue;
  match: Match;
  onPointsChanged: () => void;
  onNeedsVerify: () => void;
  tableHint?: number | null;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerRow>>({});
  const [buckets, setBuckets] = useState<Record<string, BucketLite>>({});
  const [celebrate, setCelebrate] = useState<{ points: number; coupon: WalletCoupon | null; extra: number; qid: string; double: boolean; bonus: number } | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [sponsors, setSponsors] = useState<Record<string, SponsorLite>>({});
  const [doubleArmed, setDoubleArmed] = useState(false);
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

    const { data: auth } = await sb.auth.getUser();
    if (auth.user) {
      const { data: s } = await sb
        .from("player_sessions")
        .select("table_no, streak, best_streak, double_used")
        .eq("user_id", auth.user.id)
        .eq("match_id", match.id)
        .maybeSingle();
      setMe((s as Me) ?? null);
    }

    const sIds = [...new Set([...list.map((q) => q.sponsor_id), match.sponsor_id].filter(Boolean))] as string[];
    if (sIds.length) {
      const { data: sp } = await sb.from("sponsors").select("id, name, logo_url, tagline, link_url").in("id", sIds);
      setSponsors(Object.fromEntries(((sp as SponsorLite[]) ?? []).map((x) => [x.id, x])));
    }

    const ids = list.map((q) => q.id);
    if (ids.length) {
      const { data: as } = await sb
        .from("answers")
        .select("question_id, selected_option, is_correct, points_awarded, is_double, bonus_points")
        .in("question_id", ids);
      setAnswers(Object.fromEntries(((as as AnswerRow[]) ?? []).map((a) => [a.question_id, a])));

      const bIds = [...new Set(list.map((q) => q.coupon_bucket_id).filter(Boolean))] as string[];
      if (bIds.length) {
        const { data: bs } = await sb.from("coupon_buckets").select("id, brand_name, title, is_alcohol, min_age").in("id", bIds);
        setBuckets(Object.fromEntries(((bs as BucketLite[]) ?? []).map((b) => [b.id, b])));
      }
    }
  }, [match.id, match.sponsor_id, venue.id]);

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
      const a = answers[win.id];
      setCelebrate({ points: a.points_awarded, coupon: won[0] ?? null, extra: Math.max(won.length - 1, 0), qid: win.id, double: a.is_double, bonus: a.bonus_points });
      onPointsChanged();
    })();
  }, [questions, answers, celebrate, onPointsChanged]);

  async function answer(q: Question, option: number) {
    const useDouble = doubleArmed && !me?.double_used;
    setSending(q.id);
    setError("");
    setAnswers((a) => ({ ...a, [q.id]: { question_id: q.id, selected_option: option, is_correct: null, points_awarded: 0, is_double: useDouble, bonus_points: 0 } }));
    const { error } = await supabase().rpc("submit_prediction", { p_question_id: q.id, p_option: option, p_double: useDouble });
    setSending(null);
    setDoubleArmed(false);
    if (!error && useDouble) setMe((m) => (m ? { ...m, double_used: true } : m));
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
  const cardSponsor = card ? sponsors[card.sponsor_id ?? ""] ?? sponsors[match.sponsor_id ?? ""] : undefined;
  const tables = venue.table_count ?? 0;

  // Table from a table coaster (?t=12): join it automatically once checked in.
  useEffect(() => {
    if (!tableHint || !me || me.table_no || !tables || tableHint > tables) return;
    supabase()
      .rpc("set_my_table", { p_match_id: match.id, p_table: tableHint })
      .then(({ error }) => !error && setMe((m) => (m ? { ...m, table_no: tableHint } : m)));
  }, [tableHint, me, tables, match.id]);

  async function pickTable(n: number | null) {
    const { error } = await supabase().rpc("set_my_table", { p_match_id: match.id, p_table: n });
    if (error) return setError(friendlyError(error));
    setMe((m) => (m ? { ...m, table_no: n } : m));
  }

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
            sponsor={cardSponsor}
            doubleAvailable={Boolean(me && !me.double_used)}
            doubleArmed={doubleArmed}
            onToggleDouble={() => setDoubleArmed((d) => !d)}
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

      {me && <StatusStrip me={me} />}
      {me && tables > 0 && <TablePicker tables={tables} current={me.table_no} onPick={pickTable} />}

      {history.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-ink/80">Earlier tonight</h2>
          <ul className="flex flex-col divide-y divide-ink/10 rounded-2xl bg-surface/70">
            {history.map((q) => {
              const a = answers[q.id];
              const result =
                q.status === "void" ? "Voided" : !a ? "Skipped" : a.is_correct ? `+${a.points_awarded}${a.is_double ? " 2x" : ""}` : "Missed";
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

      <LegalLinks className="pt-4" />

      <AnimatePresence>
        {celebrate && (
          <Celebration
            points={celebrate.points}
            coupon={celebrate.coupon}
            extra={celebrate.extra}
            double={celebrate.double}
            bonus={celebrate.bonus}
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
  sponsor,
  doubleAvailable,
  doubleArmed,
  onToggleDouble,
}: {
  q: Question;
  now: number;
  mine?: AnswerRow;
  bucket?: BucketLite;
  setActive?: boolean;
  sending: boolean;
  onAnswer: (i: number) => void;
  sponsor?: SponsorLite;
  doubleAvailable: boolean;
  doubleArmed: boolean;
  onToggleDouble: () => void;
}) {
  const remaining = q.locks_at ? (new Date(q.locks_at).getTime() - now) / 1000 : 0;
  const open = q.status === "live" && remaining > 0;
  const resolved = q.status === "resolved";

  let status = "";
  if (resolved)
    status = mine
      ? mine.is_correct
        ? `You called it: +${mine.points_awarded}${mine.is_double ? " with 2x" : ""}${mine.bonus_points ? `, incl. ${mine.bonus_points} streak bonus` : ""}`
        : "Not this time"
      : "Result is in";
  else if (mine) status = mine.is_double ? "Locked in with 2x. Result after the play." : "Locked in. Result after the play.";
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
            {doubleArmed && open && !mine ? `${q.points * 2} points (2x)` : `${q.points} points`}
            {bucket ? ` + ${bucket.title}` : setActive ? " + a reward if you're right" : ""}
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

      {open && !mine && doubleAvailable && (
        <button
          type="button"
          onClick={onToggleDouble}
          aria-pressed={doubleArmed}
          className={`mt-4 flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition ${
            doubleArmed ? "border-brand bg-brand/15" : "border-ink/20"
          }`}
        >
          <span>
            <span className="block font-display text-xl font-bold">{doubleArmed ? "2x is on for this one" : "Use your 2x here?"}</span>
            <span className="block text-sm text-ink/65">Doubles this question&apos;s points if you&apos;re right. One per match.</span>
          </span>
          <span className={`rounded-full px-3 py-1 font-display text-lg font-bold ${doubleArmed ? "bg-brand text-on-brand" : "bg-black/25"}`}>2x</span>
        </button>
      )}

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
            <span className="block text-ink/60">This question is brought to you by</span>
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

function StatusStrip({ me }: { me: Me }) {
  const onFire = me.streak >= 2;
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Your match">
      <div className={`rounded-2xl px-4 py-3 ${me.streak >= 3 ? "bg-brand text-on-brand" : "bg-surface/70"}`}>
        <p className="text-sm opacity-75">Streak</p>
        <p className="font-display text-2xl font-bold leading-tight">
          {me.streak} in a row
        </p>
        <p className="text-xs opacity-75">
          {me.streak >= 3 ? "+10 bonus on every right answer" : onFire ? "1 more for the +10 bonus" : `Best: ${me.best_streak}. 3 in a row = bonus`}
        </p>
      </div>
      <div className="rounded-2xl bg-surface/70 px-4 py-3">
        <p className="text-sm text-ink/70">2x points</p>
        <p className="font-display text-2xl font-bold leading-tight">{me.double_used ? "Used" : "Ready"}</p>
        <p className="text-xs text-ink/65">{me.double_used ? "Back next match" : "Switch it on before you answer"}</p>
      </div>
    </div>
  );
}

function TablePicker({ tables, current, onPick }: { tables: number; current: number | null; onPick: (n: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [n, setN] = useState<string>(current ? String(current) : "");
  if (current && !editing)
    return (
      <div className="flex items-center justify-between rounded-2xl bg-surface/70 px-4 py-3">
        <p>
          <span className="block text-sm text-ink/70">Playing for</span>
          <span className="block font-display text-2xl font-bold">Table {current}</span>
        </p>
        <button className="rounded-xl border border-ink/25 px-4 py-2 font-semibold" onClick={() => setEditing(true)}>
          Change
        </button>
      </div>
    );
  return (
    <form
      className="rounded-2xl border border-ink/15 px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (n) onPick(Number(n));
        setEditing(false);
      }}
    >
      <p className="font-display text-xl font-bold">Here with friends? Play as a table</p>
      <p className="mt-1 text-sm text-ink/70">Your table&apos;s best four scores go on the table leaderboard.</p>
      <div className="mt-3 flex gap-2">
        <select
          aria-label="Table number"
          value={n}
          onChange={(e) => setN(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-ink/25 bg-black/25 px-3 py-3 text-lg"
        >
          <option value="">Table number</option>
          {Array.from({ length: tables }, (_, i) => i + 1).map((t) => (
            <option key={t} value={t}>Table {t}</option>
          ))}
        </select>
        <button className="rounded-xl bg-brand px-5 font-semibold text-on-brand disabled:opacity-50" disabled={!n}>
          Join
        </button>
      </div>
      {current && (
        <button type="button" className="mt-3 text-sm text-ink/60 underline" onClick={() => { onPick(null); setEditing(false); }}>
          Leave table play
        </button>
      )}
    </form>
  );
}
