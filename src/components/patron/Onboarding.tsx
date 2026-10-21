"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { TERMS_VERSION, friendlyError } from "@/lib/copy";
import type { Profile } from "@/lib/types";
import { Check, ErrorNote, Field, PrimaryButton, inputClass } from "./ui";
import { TermsSheet } from "./TermsSheet";

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [name, setName] = useState("");
  const [age21, setAge21] = useState(false);
  const [age25, setAge25] = useState(false);
  const [location, setLocation] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = name.trim().length >= 2 && age21 && location && terms;

  async function submit() {
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("complete_onboarding", {
      p_display_name: name.trim(),
      p_age_21: age21,
      p_age_25: age25,
      p_location_consent: location,
      p_terms_accepted: terms,
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
        <Check checked={age21} onChange={setAge21} required>
          I am 21 years or older.
        </Check>
        <Check checked={age25} onChange={setAge25}>
          I am 25 or older. Needed to win rewards that include spirits.
        </Check>
        <Check checked={location} onChange={setLocation} required>
          I consent to location verification. My location is checked only to confirm I&apos;m at the venue,
          and my coordinates are never stored.
        </Check>
        <Check checked={terms} onChange={setTerms} required>
          I accept the{" "}
          <button type="button" className="font-semibold text-brand underline" onClick={() => setShowTerms(true)}>
            Terms and privacy notice
          </button>
          .
        </Check>
        <Check checked={marketing} onChange={setMarketing}>
          Send me offers from this venue and partner brands.
        </Check>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <PrimaryButton disabled={!ready || busy} onClick={submit}>
        {busy ? "Saving" : "Start playing"}
      </PrimaryButton>
      <p className="text-center text-sm text-ink/60">Free to play. No purchase necessary.</p>

      {showTerms && <TermsSheet onClose={() => setShowTerms(false)} />}
    </div>
  );
}
