"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PrimaryButton } from "./ui";

const SPARKS = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2;
  const dist = 120 + (i % 3) * 55;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 6 + (i % 4) * 3, alt: i % 2 === 0 };
});

export function Celebration({ points, onClose }: { points: number; onClose: () => void }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="brand-canvas fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6"
      role="dialog"
      aria-modal="true"
      aria-label="You called it"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="pointer-events-none absolute left-1/2 top-[38%]" aria-hidden>
        {!reduce &&
          SPARKS.map((s, i) => (
            <motion.span
              key={i}
              className="absolute block rounded-full"
              style={{
                width: s.size,
                height: s.size,
                background: s.alt ? "var(--brand-primary)" : "var(--brand-secondary)",
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
              animate={{ x: s.x, y: s.y, opacity: 0, scale: 1 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            />
          ))}
      </div>

      <motion.p
        className="font-display text-2xl font-semibold text-ink/80"
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05 }}
      >
        You called it
      </motion.p>
      <motion.p
        className="tabular font-display text-[7.5rem] font-extrabold leading-none text-brand"
        initial={{ scale: reduce ? 1 : 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
      >
        +{points}
      </motion.p>
      <p className="mt-6 max-w-xs text-center text-[17px] text-ink/75">
        Added to your score. Keep going to climb the leaderboard.
      </p>

      <motion.div
        className="mt-10 w-full max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <PrimaryButton onClick={onClose}>Done</PrimaryButton>
      </motion.div>
    </motion.div>
  );
}
