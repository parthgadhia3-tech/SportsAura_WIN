"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { HOW_TO_PLAY, friendlyError } from "@/lib/copy";
import type { Profile } from "@/lib/types";
import { ErrorNote, GhostButton } from "./ui";
import { TermsBody } from "./TermsSheet";
import { MyRecord } from "./MyRecord";

export function MoreTab({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const [section, setSection] = useState<"how" | "terms" | "account">("account");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm25() {
    const { error } = await supabase().rpc("confirm_age_25");
    if (error) return setError(friendlyError(error));
    onProfile({ ...profile, age_verified_25: true });
  }

  async function deleteAccount() {
    setBusy(true);
    setError("");
    const { data } = await supabase().auth.getSession();
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    });
    setBusy(false);
    if (!res.ok) return setError("We couldn't delete your account. Try again or ask the venue staff.");
    await supabase().auth.signOut();
    location.reload();
  }

  return (
    <div className="px-5 pb-6 pt-4">
      <div className="mb-6 grid grid-cols-3 rounded-xl bg-black/25 p-1" role="tablist">
        {(
          [
            ["account", "Me"],
            ["how", "How to play"],
            ["terms", "Terms"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={section === k}
            onClick={() => setSection(k)}
            className={`rounded-lg py-2.5 text-[15px] font-semibold ${section === k ? "bg-brand text-on-brand" : "text-ink/70"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "how" && (
        <ol className="flex flex-col gap-5">
          {HOW_TO_PLAY.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="tabular flex size-11 shrink-0 items-center justify-center rounded-full bg-brand font-display text-2xl font-bold text-on-brand">
                {i + 1}
              </span>
              <div>
                <h3 className="font-display text-2xl font-semibold leading-tight">{s.title}</h3>
                <p className="mt-1 text-[16px] leading-relaxed text-ink/75">{s.body}</p>
              </div>
            </li>
          ))}
          <li className="rounded-xl bg-black/25 p-4 text-[15px] text-ink/80">
            It&apos;s free. There&apos;s nothing to buy, and points have no cash value.
          </li>
        </ol>
      )}

      {section === "terms" && <TermsBody />}

      {section === "account" && (
        <div className="flex flex-col gap-4">
          <MyRecord />
          <div className="rounded-2xl bg-surface/80 p-4">
            <p className="text-sm text-ink/60">Playing as</p>
            <p className="font-display text-3xl font-bold">{profile.display_name}</p>
            <p className="mt-2 text-[15px] text-ink/75">
              {profile.age_verified_25 ? "Confirmed 25+. Eligible for all rewards." : "Confirmed 21+."}
            </p>
          </div>

          {!profile.age_verified_25 && (
            <GhostButton onClick={confirm25}>I&apos;m 25 or older. Unlock spirits rewards</GhostButton>
          )}

          <GhostButton onClick={() => supabase().auth.signOut().then(() => location.reload())}>Sign out</GhostButton>
          <p className="-mt-2 text-center text-sm text-ink/55">
            Your points, record and rewards stay saved to your number. Sign in again on any phone to get them back.
          </p>

          {!confirmDelete ? (
            <button className="mt-4 text-[15px] font-semibold text-red-300 underline" onClick={() => setConfirmDelete(true)}>
              Delete my account and data
            </button>
          ) : (
            <div className="rounded-2xl border border-red-400/40 p-4">
              <p className="text-[15px]">
                This permanently deletes your profile, points, answers and rewards. It can&apos;t be undone.
              </p>
              <div className="mt-4 flex gap-3">
                <GhostButton onClick={() => setConfirmDelete(false)}>Keep account</GhostButton>
                <button
                  disabled={busy}
                  onClick={deleteAccount}
                  className="w-full rounded-xl bg-red-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Deleting" : "Delete forever"}
                </button>
              </div>
            </div>
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </div>
  );
}
