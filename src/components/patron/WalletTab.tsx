"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LIABILITY_LINE } from "@/lib/copy";
import { BUCKET_PUBLIC_COLUMNS, type WalletCoupon } from "@/lib/types";
import { Spinner } from "./ui";

function fmt(d: string) {
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function WalletTab() {
  const [coupons, setCoupons] = useState<WalletCoupon[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .from("user_coupons")
      .select(`id, code, issued_at, expires_at, redeemed_at, question_id, coupon_buckets(${BUCKET_PUBLIC_COLUMNS})`)
      .order("issued_at", { ascending: false })
      .then(({ data }) => setCoupons((data as unknown as WalletCoupon[]) ?? []));
  }, []);

  async function copy(c: WalletCoupon) {
    if (!c.code) return;
    try {
      await navigator.clipboard.writeText(c.code);
      setCopied(c.id);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked: code is visible on screen anyway */
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 pt-4">
      <p className="rounded-xl bg-black/25 px-4 py-3 text-sm leading-snug text-ink/80">{LIABILITY_LINE}</p>

      {coupons === null ? (
        <Spinner label="Opening your wallet" />
      ) : coupons.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-display text-3xl font-bold">No rewards yet</p>
          <p className="mt-2 text-ink/70">Look for questions marked with a reward and be quick to call them right.</p>
        </div>
      ) : (
        coupons.map((c) => {
          const b = c.coupon_buckets;
          const expired = c.expires_at && new Date(c.expires_at) < new Date();
          const used = Boolean(c.redeemed_at);
          const inactive = expired || used;
          return (
            <article
              key={c.id}
              className={`overflow-hidden rounded-2xl bg-surface/90 ${inactive ? "opacity-55" : ""}`}
            >
              <div className="flex items-center gap-3 px-4 pt-4">
                {b.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logo_url} alt="" className="size-10 rounded-lg bg-white object-contain" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink/70">{b.brand_name}</p>
                  <h3 className="font-display text-2xl font-bold leading-tight">{b.title}</h3>
                </div>
                {b.is_alcohol && (
                  <span className="shrink-0 rounded-md border border-ink/30 px-2 py-1 text-xs font-semibold">
                    {b.min_age}+ ID
                  </span>
                )}
              </div>

              {b.description && <p className="px-4 pt-2 text-[15px] text-ink/75">{b.description}</p>}

              {c.code && (
                <button
                  onClick={() => copy(c)}
                  className="tabular mx-4 mt-3 block w-[calc(100%-2rem)] rounded-xl border-2 border-dashed border-ink/30 py-3 text-center font-display text-3xl font-bold tracking-widest"
                  aria-label={`Copy code ${c.code}`}
                >
                  {copied === c.id ? "Copied" : c.code}
                </button>
              )}

              <div className="flex items-center justify-between gap-3 px-4 py-4">
                <p className="text-sm text-ink/60">
                  {used
                    ? `Redeemed ${fmt(c.redeemed_at!)}`
                    : expired
                      ? "Expired"
                      : c.expires_at
                        ? `Valid until ${fmt(c.expires_at)}`
                        : `Won ${fmt(c.issued_at)}`}
                </p>
                {!inactive &&
                  (b.has_link ? (
                    <a
                      href={`/api/track?c=${c.id}`}
                      target="_blank"
                      rel="noopener"
                      className="shrink-0 rounded-xl bg-brand px-4 py-2.5 font-semibold text-on-brand"
                    >
                      Open offer
                    </a>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold text-brand">Show this to staff</span>
                  ))}
              </div>
              {b.terms && <p className="border-t border-ink/10 px-4 py-3 text-xs text-ink/55">{b.terms}</p>}
            </article>
          );
        })
      )}
    </div>
  );
}
