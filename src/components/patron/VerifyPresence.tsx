"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import type { Match, Venue } from "@/lib/types";
import { ErrorNote, GhostButton, PrimaryButton, inputClass } from "./ui";

type Mode = "locating" | "too_far" | "pin";

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject({ code: 2, message: "unsupported" });
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000,
    });
  });
}

export function VerifyPresence({
  venue,
  match,
  returning,
  qrExpired,
  onVerified,
}: {
  venue: Venue;
  match: Match;
  returning: boolean;
  qrExpired?: boolean;
  onVerified: (method: "gps" | "pin" | "qr") => void;
}) {
  const [mode, setMode] = useState<Mode>("locating");
  const [note, setNote] = useState("");
  const [distance, setDistance] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);

  const tryGps = useCallback(async () => {
    setMode("locating");
    setError("");
    try {
      const pos = await getPosition();
      const { data, error } = await supabase().rpc("verify_presence_gps", {
        p_venue_id: venue.id,
        p_match_id: match.id,
        p_lat: pos.coords.latitude,
        p_lng: pos.coords.longitude,
      });
      if (error) throw error;
      const r = (data as { ok: boolean; distance_m: number | null; reason: string | null }[])[0];
      if (r?.ok) return onVerified("gps");
      if (r?.reason === "out_of_range") {
        setDistance(r.distance_m);
        setMode("too_far");
        return;
      }
      setNote(friendlyError(r?.reason ?? ""));
      setMode("pin");
    } catch (e) {
      const code = (e as GeolocationPositionError)?.code;
      if (code === 1) setNote("Location is turned off for this site, so use the venue PIN instead.");
      else if (code === 2 || code === 3) setNote("We couldn't get a GPS fix indoors. Use the venue PIN instead.");
      else setNote(friendlyError(e));
      setMode("pin");
    }
  }, [venue.id, match.id, onVerified]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    tryGps();
  }, [tryGps]);

  async function submitPin() {
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("verify_presence_pin", {
      p_venue_id: venue.id,
      p_match_id: match.id,
      p_pin: pin,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    const r = (data as { ok: boolean; reason: string | null }[])[0];
    if (r?.ok) return onVerified("pin");
    setPin("");
    setError(friendlyError(r?.reason ?? ""));
  }

  return (
    <div className="flex flex-col gap-6 px-6 pb-8 pt-10">
      <div>
        <h2 className="font-display text-4xl font-bold leading-none">
          {returning ? "Welcome back" : "Check in to play"}
        </h2>
        <p className="mt-3 text-[17px] text-ink/75">
          {returning
            ? `Confirm you're still at ${venue.name} to keep playing ${match.title}.`
            : `Predictions are only open to people at ${venue.name}. This takes a second and only happens once per match.`}
        </p>
        {qrExpired && (
          <p className="mt-3 rounded-xl bg-black/25 px-4 py-3 text-[15px] text-ink/80">
            The TV code you scanned had already changed. Scan it again for an instant check-in, or use the options below.
          </p>
        )}
      </div>

      {mode === "locating" && (
        <div className="flex items-center gap-4 rounded-2xl bg-surface/80 p-5" role="status">
          <span className="size-7 shrink-0 animate-spin rounded-full border-4 border-ink/20 border-t-brand" />
          <span className="text-[17px]">Checking your location. Allow access if your browser asks.</span>
        </div>
      )}

      {mode === "too_far" && (
        <div className="flex flex-col gap-4">
          <p className="rounded-2xl bg-surface/80 p-5 text-[17px]">
            Your phone puts you about{" "}
            <strong className="tabular">
              {distance != null ? (distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`) : "far"}
            </strong>{" "}
            from {venue.name}. GPS can drift indoors, so try again near a window or use the venue PIN.
          </p>
          <PrimaryButton onClick={tryGps}>Try location again</PrimaryButton>
          <GhostButton onClick={() => { setNote(""); setMode("pin"); }}>Use the venue PIN</GhostButton>
        </div>
      )}

      {mode === "pin" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.length === 4) submitPin();
          }}
        >
          {note && <p className="text-[15px] text-ink/70">{note}</p>}
          <label className="block">
            <span className="mb-2 block text-[17px] font-semibold">
              Enter the 4-digit PIN on the TV screen or ask your server
            </span>
            <input
              className={`${inputClass} tabular text-center font-display text-5xl font-bold tracking-[0.6em]`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              aria-describedby="pin-help"
            />
          </label>
          <p id="pin-help" className="text-sm text-ink/60">
            The PIN changes every 10 minutes. You only need it once for this match.
          </p>
          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton type="submit" disabled={pin.length !== 4 || busy}>
            {busy ? "Checking" : "Check in"}
          </PrimaryButton>
          <GhostButton type="button" onClick={tryGps}>
            Try location instead
          </GhostButton>
        </form>
      )}
    </div>
  );
}
