"use client";

import { useLegalSettings } from "@/lib/useLegalSettings";

/** "Terms" and "Privacy" links shown at the bottom of player screens. */
export function LegalLinks({ className = "" }: { className?: string }) {
  const { termsHref, privacyHref } = useLegalSettings();
  const ext = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {});
  return (
    <nav aria-label="Legal" className={`flex justify-center gap-5 text-sm text-ink/55 ${className}`}>
      <a href={termsHref} {...ext(termsHref)} className="underline underline-offset-2 hover:text-ink/80">
        Terms
      </a>
      <a href={privacyHref} {...ext(privacyHref)} className="underline underline-offset-2 hover:text-ink/80">
        Privacy
      </a>
    </nav>
  );
}
