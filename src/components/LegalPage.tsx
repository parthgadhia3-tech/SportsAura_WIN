"use client";

import Link from "next/link";
import { themeVars } from "@/lib/theme";
import { LEGAL_UPDATED, privacyNotice, termsOfUse } from "@/lib/legal";
import { useLegalSettings } from "@/lib/useLegalSettings";

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const { settings } = useLegalSettings();
  const sections = kind === "terms" ? termsOfUse(settings) : privacyNotice(settings);
  const title = kind === "terms" ? "Terms of Use" : "Privacy Notice";

  return (
    <div className="brand-canvas min-h-dvh" style={themeVars(null)}>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-10">
        <p className="font-display text-xl font-bold text-brand">SportsAura</p>
        <h1 className="mt-4 font-display text-5xl font-bold leading-none">{title}</h1>
        <p className="mt-3 text-sm text-ink/60">Last updated {LEGAL_UPDATED}</p>
        <div className="mt-8 flex flex-col gap-7">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="font-display text-2xl font-semibold">{s.heading}</h2>
              {s.paras.map((p, i) => (
                <p key={i} className="mt-2 text-[16px] leading-relaxed text-ink/85">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-10 flex gap-5 text-sm">
          <Link href={kind === "terms" ? "/privacy" : "/terms"} className="font-semibold text-brand underline">
            {kind === "terms" ? "Read the Privacy Notice" : "Read the Terms of Use"}
          </Link>
          <button onClick={() => history.back()} className="text-ink/60 underline">
            Back
          </button>
        </p>
      </main>
    </div>
  );
}
