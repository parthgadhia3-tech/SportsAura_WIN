"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { StaffGate } from "@/components/staff/StaffGate";
import { supabase } from "@/lib/supabase";
import { fmtCountdown, useLeaderboard, useLiveMatch, useVenue, useVenuePin, useVenueQr } from "@/components/staff/useVenueData";

// Full-screen display for the bar's TV. Sign in once as the venue manager.
export default function TvPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#071517]" />}>
      <StaffGate roles={["venue_manager", "admin", "game_master"]} title="TV screen" dark>
        {(staff) => <TvLoader fallbackVenue={staff.venue_id} />}
      </StaffGate>
    </Suspense>
  );
}

function TvLoader({ fallbackVenue }: { fallbackVenue: string | null }) {
  const params = useSearchParams();
  const fromUrl = params.get("venue") ?? fallbackVenue;
  const [firstVenue, setFirstVenue] = useState<string | null>(null);

  // Admins and Game Masters aren't tied to a venue: use the first active one.
  useEffect(() => {
    if (fromUrl) return;
    supabase()
      .from("venues")
      .select("id")
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setFirstVenue(data?.id ?? null));
  }, [fromUrl]);

  return <Tv venueId={fromUrl ?? firstVenue} />;
}

function Tv({ venueId }: { venueId: string | null }) {
  const venue = useVenue(venueId);
  const match = useLiveMatch();
  const { pin, secondsLeft } = useVenuePin(venueId);
  const { code } = useVenueQr(venueId);
  const board = useLeaderboard(match?.id, venueId, 5);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div
      className="grid min-h-dvh grid-cols-[1.1fr_1fr] gap-[4vw] p-[4vw] text-[#F3F1E8]"
      style={{ background: "radial-gradient(circle at 30% -10%, #1F5257 0%, #0C2427 45%, #071517 100%)" }}
    >
      <div className="flex flex-col justify-between">
        <div>
          <p className="font-display text-[3vw] font-bold leading-none">{venue?.name}</p>
          <p className="mt-2 text-[1.6vw] text-white/65">{match ? match.title : "Predictions open when the match starts"}</p>
        </div>
        <div className="flex items-center gap-[3vw]">
          <div className="shrink-0 rounded-[1.5vw] bg-white p-[1vw]">
            {venue && origin && code ? (
              <QRCodeSVG
                value={`${origin}/v/${venue.slug}?k=${code}`}
                size={512}
                marginSize={1}
                level="M"
                style={{ width: "min(42vh, 26vw)", height: "min(42vh, 26vw)" }}
              />
            ) : (
              <div style={{ width: "min(42vh, 26vw)", height: "min(42vh, 26vw)" }} />
            )}
          </div>
          <div>
            <p className="font-display text-[4.2vw] font-extrabold leading-[0.95]">Scan to play free</p>
            <p className="mt-[1vw] text-[1.5vw] leading-snug text-white/75">
              Point your phone camera at the code. You&apos;re checked in for the whole match.
            </p>
          </div>
        </div>
        <div className="flex items-end justify-between gap-[2vw] border-t border-white/15 pt-[1.5vw]">
          <p className="text-[1.4vw] text-white/65">
            No camera? Scan your table coaster, or enter this PIN:
          </p>
          <p className="tabular font-display text-[5vw] font-extrabold leading-none tracking-[0.08em] text-[#FFB020]">
            {pin ?? "····"}
            <span className="ml-[1vw] align-middle font-sans text-[1.1vw] font-normal tracking-normal text-white/55">
              {fmtCountdown(secondsLeft)}
            </span>
          </p>
        </div>
        <p className="text-[1.1vw] text-white/50">21+ only. No purchase necessary. The code changes every 30 seconds.</p>
      </div>

      <div className="flex flex-col rounded-[2vw] bg-black/30 p-[3vw]">
        <p className="font-display text-[2.6vw] font-bold">Top of the bar</p>
        <ol className="mt-[2vw] flex flex-col gap-[1.2vw]">
          {board.map((r, i) => (
            <li key={i} className="flex items-center gap-[1.5vw]">
              <span className={`tabular w-[4vw] font-display text-[3.4vw] font-extrabold ${i === 0 ? "text-[#FFB020]" : "text-white/55"}`}>
                {r.rank}
              </span>
              <span className="flex-1 truncate text-[2.2vw] font-semibold">{r.display_name}</span>
              <span className="tabular font-display text-[3vw] font-bold">{r.points}</span>
            </li>
          ))}
          {board.length === 0 && <li className="text-[1.8vw] text-white/55">First result puts names on the board.</li>}
        </ol>
      </div>
    </div>
  );
}
