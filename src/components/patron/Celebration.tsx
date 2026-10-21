"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LIABILITY_LINE } from "@/lib/copy";
import type { WalletCoupon } from "@/lib/types";
import { PrimaryButton } from "./ui";

const SPARKS = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2;
  const dist = 120 + (i % 3) * 55;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, size: 6 + (i % 4) * 3, alt: i % 2 === 0 };
});

export function Celebration({
  points,
  coupon,
  extra = 0,
  onClose,
}: {
  points: number;
  coupon: WalletCoupon | null;
  extra?: number;
  onClose: () => void;
}) {
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

      {coupon ? (
        <motion.div
          className="mt-8 w-full max-w-sm overflow-hidden rounded-2xl bg-ink text-[color:var(--brand-surface)] shadow-2xl"
          style={{ transformPerspective: 900 }}
          initial={{ rotateX: reduce ? 0 : -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={{ delay: 0.75, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-3 bg-brand px-5 py-3 text-on-brand">
            {coupon.coupon_buckets.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coupon.coupon_buckets.logo_url} alt="" className="size-8 rounded bg-white object-contain" />
            )}
            <span className="font-display text-lg font-bold">{coupon.coupon_buckets.brand_name}</span>
          </div>
          <div className="px-5 py-4">
            <p className="font-display text-3xl font-bold leading-tight">{coupon.coupon_buckets.title}</p>
            {coupon.code && (
              <p className="tabular mt-3 rounded-lg border-2 border-dashed border-current/30 px-3 py-2 text-center font-display text-2xl font-bold tracking-widest">
                {coupon.code}
              </p>
            )}
            {coupon.coupon_buckets.is_alcohol && (
              <p className="mt-3 text-sm opacity-75">{LIABILITY_LINE}</p>
            )}
          </div>
        </motion.div>
      ) : (
        <p className="mt-6 max-w-xs text-center text-[17px] text-ink/75">
          Points added to your score. Keep going to climb the leaderboard.
        </p>
      )}

      {coupon && extra > 0 && (
        <p className="mt-4 text-center text-[17px] font-semibold text-brand-2">
          +{extra} more {extra === 1 ? "reward" : "rewards"} saved to your wallet
        </p>
      )}

      <motion.div
        className="mt-10 w-full max-w-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: coupon ? 1.3 : 0.6 }}
      >
        <PrimaryButton onClick={onClose}>{coupon ? "Saved to wallet. Done" : "Done"}</PrimaryButton>
      </motion.div>
    </motion.div>
  );
}
