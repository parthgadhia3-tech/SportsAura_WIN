"use client";

import { TERMS, TERMS_VERSION } from "@/lib/copy";

export function TermsBody() {
  return (
    <div className="flex flex-col gap-5">
      {TERMS.map((t) => (
        <section key={t.heading}>
          <h3 className="font-display text-xl font-semibold">{t.heading}</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-ink/80">{t.body}</p>
        </section>
      ))}
      <p className="text-sm text-ink/50">Version {TERMS_VERSION}</p>
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
