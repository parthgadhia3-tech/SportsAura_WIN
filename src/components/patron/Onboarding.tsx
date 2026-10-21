"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { TERMS_VERSION, friendlyError } from "@/lib/copy";
import type { Profile } from "@/lib/types";
import { Check, ErrorNote, Field, PrimaryButton, inputClass } from "./ui";
import { TermsSheet } from "./TermsSheet";
import { LegalLinks } from "@/components/LegalLinks";

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = name.trim().length >= 2 && agreed;

  async function submit() {
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("complete_onboarding", {
      p_display_name: name.trim(),
      // One combined statement, recorded against each requirement it covers.
      p_age_21: agreed,
      p_age_25: false, // confirmed later under More > Me, only needed for spirits rewards
      p_location_consent: agreed,
      p_terms_accepted: agreed,
      p_marketing: marketing,
      p_terms_version: TERMS_VERSION,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    onDone(data as Profile);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 pb-10 pt-12">
      <h1 className="font-display text-4xl font-bold">Set up your player card</h1>

      <Field label="Display name" hint="Shown on the leaderboard. Use a nickname if you like.">
        <input
          className={inputClass}
          maxLength={24}
          placeholder="e.g. Yorker King"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-3">
        <Check checked={agreed} onChange={setAgreed} required>
          I&apos;m 21 or older, I agree to a quick location check to confirm I&apos;m at the venue (my
          coordinates are never stored), and I accept the{" "}
          <button type="button" className="font-semibold text-brand underline" onClick={() => setShowTerms(true)}>
            Terms and privacy notice
          </button>
          .
        </Check>
        <Check checked={marketing} onChange={setMarketing}>
          Send me club offers during the match.
        </Check>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <PrimaryButton disabled={!ready || busy} onClick={submit}>
        {busy ? "Saving" : "Start playing"}
      </PrimaryButton>
      <p className="text-center text-sm text-ink/60">Free to play. No purchase necessary.</p>
      <LegalLinks />

      {showTerms && <TermsSheet onClose={() => setShowTerms(false)} />}
    </div>
  );
}
