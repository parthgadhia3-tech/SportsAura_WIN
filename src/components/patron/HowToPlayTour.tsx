"use client";

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

/**
 * First-run walkthrough: four illustrated steps that mirror the real screens,
 * shown once after a player finishes setup (and on demand from How to play).
 */

type ArtProps = { reduce: boolean };
type Step = { title: string; body: string; Art: (props: ArtProps) => ReactNode };

const ease = [0.16, 1, 0.3, 1] as const;

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto h-[230px] w-[150px] rounded-[26px] border-[5px] border-ink/80 bg-black/40 p-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,.7)]">
      <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-ink/30" />
      {children}
    </div>
  );
}

/* 1. Play from anywhere: the match is live on your phone */
function AnywhereArt({ reduce }: ArtProps) {
  const spots = ["Home", "Office", "Bar", "On the go"];
  return (
    <div className="relative flex h-[250px] items-center justify-center gap-5">
      <ul className="flex flex-col gap-2">
        {spots.map((p, n) => (
          <motion.li
            key={p}
            className="rounded-full border border-ink/25 bg-black/30 px-3 py-1 text-xs font-semibold text-ink/80"
            initial={reduce ? false : { x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.15 + n * 0.15, duration: 0.5, ease }}
          >
            {p}
          </motion.li>
        ))}
      </ul>
      <motion.div initial={reduce ? false : { y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7, ease }}>
        <Phone>
          <div className="flex h-[170px] flex-col justify-between rounded-xl bg-brand p-3 text-on-brand">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
              <motion.span
                className="size-1.5 rounded-full bg-current"
                animate={reduce ? undefined : { opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              Live now
            </span>
            <span className="font-display text-xl font-bold leading-tight">IND vs WI</span>
            <span className="rounded-lg bg-black/25 py-1.5 text-center text-[11px] font-bold">Play</span>
          </div>
        </Phone>
      </motion.div>
    </div>
  );
}

/* 2. A question appears, tap before the timer runs out */
function PredictArt({ reduce }: ArtProps) {
  const [left, setLeft] = useState(reduce ? 12 : 15);
  const [picked, setPicked] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setLeft((s) => (s > 9 ? s - 1 : s)), 600);
    const p = setTimeout(() => setPicked(true), 2600);
    return () => {
      clearInterval(t);
      clearTimeout(p);
    };
  }, [reduce]);
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex h-[250px] items-center justify-center">
      <Phone>
        <motion.div
          className="rounded-xl bg-surface p-2.5"
          initial={reduce ? false : { y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease }}
        >
          <div className="flex items-start justify-between gap-1">
            <p className="font-display text-[10px] font-semibold text-brand-2">10 points</p>
            <svg viewBox="0 0 40 40" className="size-9 -rotate-90" aria-hidden>
              <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="4" />
              <circle
                cx="20" cy="20" r={r} fill="none" stroke="var(--brand-primary)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - left / 15)} style={{ transition: "stroke-dashoffset .5s linear" }}
              />
              <text x="20" y="25" textAnchor="middle" transform="rotate(90 20 20)" className="fill-ink font-display text-[13px] font-bold">
                {left}
              </text>
            </svg>
          </div>
          <p className="font-display text-[15px] font-bold leading-tight">Six in the next over?</p>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <motion.span
              className={`rounded-lg border-2 px-2 py-2 text-center font-display text-sm font-semibold ${
                picked ? "border-brand bg-brand text-on-brand" : "border-ink/25 bg-black/20"
              }`}
              animate={picked && !reduce ? { scale: [1, 0.92, 1] } : {}}
              transition={{ duration: 0.25 }}
            >
              Yes
            </motion.span>
            <span className="rounded-lg border-2 border-ink/25 bg-black/20 px-2 py-2 text-center font-display text-sm font-semibold">No</span>
          </div>
          <p className={`mt-2 text-center text-[10px] text-ink/70 transition-opacity ${picked ? "opacity-100" : "opacity-0"}`}>
            Locked in
          </p>
        </motion.div>
      </Phone>
      {!reduce && !picked && (
        <motion.span
          className="pointer-events-none absolute size-9 rounded-full border-4 border-ink/80"
          initial={{ x: 60, y: 90, opacity: 0 }}
          animate={{ x: -22, y: 40, opacity: 1 }}
          transition={{ delay: 1.2, duration: 1.2, ease }}
          aria-hidden
        />
      )}
    </div>
  );
}

/* 3. Right answers score points and move you up */
function ScoreArt({ reduce }: ArtProps) {
  const [up, setUp] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setUp(true), 1100);
    return () => clearTimeout(t);
  }, [reduce]);
  const rows = up
    ? [
        { n: "You", p: 40, me: true },
        { n: "Rohit Fan", p: 35 },
        { n: "Bandra Bouncer", p: 20 },
      ]
    : [
        { n: "Rohit Fan", p: 35 },
        { n: "Bandra Bouncer", p: 20 },
        { n: "You", p: 30, me: true },
      ];
  return (
    <div className="relative flex h-[250px] flex-col items-center justify-center">
      <AnimatePresence>
        {up && !reduce && (
          <motion.p
            className="tabular absolute top-2 font-display text-5xl font-extrabold text-brand"
            initial={{ y: 20, opacity: 0, scale: 0.6 }}
            animate={{ y: -6, opacity: [0, 1, 1, 0], scale: 1 }}
            transition={{ duration: 1.6, ease }}
          >
            +10
          </motion.p>
        )}
      </AnimatePresence>
      <ol className="mt-6 flex w-[230px] flex-col gap-2">
        {rows.map((r, i) => (
          <motion.li
            key={r.n}
            layout={!reduce}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.me ? "bg-brand text-on-brand" : "bg-surface/90"}`}
          >
            <span className="tabular w-4 font-display text-lg font-bold">{i + 1}</span>
            <span className="flex-1 truncate text-sm font-semibold">{r.n}</span>
            <span className="tabular font-display text-lg font-bold">{r.p}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/* 4. A leaderboard for just your group */
function GroupArt({ reduce }: ArtProps) {
  const rows = [
    ["1", "Riya", "80"],
    ["2", "You", "70"],
    ["3", "Kabir", "50"],
  ];
  return (
    <div className="flex h-[250px] items-center justify-center">
      <Phone>
        <div className="mb-2 flex gap-1">
          <span className="rounded-full border border-ink/30 px-2 py-0.5 text-[9px] font-semibold text-ink/70">Everyone</span>
          <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold text-on-brand">Office gang</span>
        </div>
        <ol className="flex flex-col gap-1.5">
          {rows.map(([r, n, p], k) => (
            <motion.li
              key={n}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${n === "You" ? "bg-brand text-on-brand" : "bg-surface/80"}`}
              initial={reduce ? false : { x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: reduce ? 0 : 0.2 + k * 0.15, duration: 0.45, ease }}
            >
              <span className="w-3 font-display">{r}</span>
              <span className="flex-1">{n}</span>
              <span className="tabular font-display">{p}</span>
            </motion.li>
          ))}
        </ol>
        <p className="mt-2 rounded-lg border border-dashed border-ink/30 py-1 text-center text-[10px] font-bold tracking-widest text-ink/70">CODE K7M2QX</p>
      </Phone>
    </div>
  );
}

const STEPS: Step[] = [
  {
    title: "Play from anywhere",
    body: "When a match is live, open Live. Home, office or out with friends: no check-in, no codes.",
    Art: AnywhereArt,
  },
  {
    title: "Call the next play",
    body: "A question pops up during the match. Tap your answer before the timer runs out.",
    Art: PredictArt,
  },
  {
    title: "10 points a right call",
    body: "Every right answer is worth 10 points. Climb the match and series leaderboards.",
    Art: ScoreArt,
  },
  {
    title: "Bring your group",
    body: "Make a group, share the code, and get a leaderboard of just your friends.",
    Art: GroupArt,
  },
];

export function HowToPlayTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const reduce = Boolean(useReducedMotion());
  const last = i === STEPS.length - 1;
  const step = STEPS[i];

  const go = (n: number) => {
    if (n < 0 || n >= STEPS.length) return;
    setDir(n > i ? 1 : -1);
    setI(n);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -60 || info.velocity.x < -400) go(i + 1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(i - 1);
  }

  return (
    <motion.div
      className="brand-canvas fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink/60">
            {i + 1} of {STEPS.length}
          </p>
          {!last && (
            <button className="rounded-lg px-3 py-2 font-semibold text-ink/70" onClick={onClose}>
              Skip
            </button>
          )}
        </div>

        <div className="relative flex flex-1 flex-col justify-center overflow-hidden">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={i}
              custom={dir}
              initial={reduce ? { opacity: 0 } : { x: dir * 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { x: dir * -60, opacity: 0 }}
              transition={{ duration: 0.3, ease }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.25}
              onDragEnd={onDragEnd}
              className="relative cursor-grab touch-pan-y active:cursor-grabbing"
            >
              <step.Art reduce={reduce} />
              <h2 className="mt-6 font-display text-[2.6rem] font-bold leading-none">{step.title}</h2>
              <p className="mt-3 text-[17px] leading-relaxed text-ink/80">{step.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mb-5 flex justify-center gap-2" aria-hidden>
          {STEPS.map((_, n) => (
            <span
              key={n}
              className={`h-2 rounded-full transition-all ${n === i ? "w-7 bg-brand" : "w-2 bg-ink/25"}`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {i > 0 && (
            <button
              className="rounded-xl border border-ink/25 px-5 py-4 font-semibold"
              onClick={() => go(i - 1)}
            >
              Back
            </button>
          )}
          <button
            className="flex-1 rounded-xl bg-brand px-5 py-4 font-display text-xl font-bold tracking-wide text-on-brand active:scale-[.98]"
            onClick={() => (last ? onClose() : go(i + 1))}
            autoFocus
          >
            {last ? "Let's play" : "Next"}
          </button>
        </div>
        <p className="mt-3 text-center text-sm text-ink/55">Free to play. Points have no cash value.</p>
      </div>
    </motion.div>
  );
}
