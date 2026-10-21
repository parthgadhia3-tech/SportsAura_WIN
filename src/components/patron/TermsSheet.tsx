"use client";

import { LEGAL_UPDATED, termsOfUse } from "@/lib/legal";
import { useLegalSettings } from "@/lib/useLegalSettings";

export function TermsBody() {
  const { settings, termsHref, privacyHref } = useLegalSettings();
  const ext = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {});
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <a href={termsHref} {...ext(termsHref)} className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-on-brand">
          Open full Terms of Use
        </a>
        <a href={privacyHref} {...ext(privacyHref)} className="rounded-xl border border-ink/25 px-4 py-2.5 font-semibold">
          Privacy Notice
        </a>
      </div>
      {termsOfUse(settings).map((t) => (
        <section key={t.heading}>
          <h3 className="font-display text-xl font-semibold">{t.heading}</h3>
          {t.paras.map((p, i) => (
            <p key={i} className="mt-1 text-[15px] leading-relaxed text-ink/80">
              {p}
            </p>
          ))}
        </section>
      ))}
      <p className="text-sm text-ink/50">Last updated {LEGAL_UPDATED}</p>
    </div>
  );
}

export function TermsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Terms and privacy notice"
      onClick={onClose}
    >
      <div
        className="brand-canvas max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl px-6 pb-10 pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-3xl font-bold">Terms and privacy</h2>
          <button className="rounded-lg px-3 py-2 font-semibold text-brand" onClick={onClose}>
            Close
          </button>
        </div>
        <TermsBody />
      </div>
    </div>
  );
}
