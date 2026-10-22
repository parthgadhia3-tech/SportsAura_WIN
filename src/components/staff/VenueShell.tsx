"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Venue, VenueAccount } from "@/lib/types";
import { StaffGate, type StaffMember } from "./StaffGate";
import { useVenue, useVenueAccount } from "./useVenueData";

export type VenueCtx = {
  staff: StaffMember;
  venueId: string | null;
  venue: Venue | null;
  account: VenueAccount | null | undefined;
  refresh: () => void;
};

/** Sign-in, venue picker, header with section links, and the account banner. */
export function VenueShell({ title, children }: { title: string; children: (ctx: VenueCtx) => ReactNode }) {
  return (
    <StaffGate roles={["venue_manager", "admin", "game_master"]} title={title} dark>
      {(staff) => <Inner staff={staff}>{children}</Inner>}
    </StaffGate>
  );
}

const LINKS = [
  { href: "/venue", label: "Dashboard" },
  { href: "/venue/report", label: "Monthly report" },
  { href: "/venue/billing", label: "Plan & billing" },
  { href: "/venue/coasters", label: "Table coasters" },
];

function Inner({ staff, children }: { staff: StaffMember; children: (ctx: VenueCtx) => ReactNode }) {
  const path = usePathname();
  const [venueId, setVenueId] = useState<string | null>(staff.venue_id);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (staff.role === "venue_manager") return;
    supabase()
      .from("venues")
      .select("id, name, slug")
      .order("name")
      .then(({ data }) => {
        const list = (data as Venue[]) ?? [];
        setVenues(list);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem("md-venue");
        } catch {
          /* ignore */
        }
        setVenueId((cur) => cur ?? (list.find((v) => v.id === saved)?.id || list[0]?.id || null));
      });
  }, [staff.role]);

  const venue = useVenue(venueId, version);
  const account = useVenueAccount(venueId, version);

  return (
    <div className="min-h-dvh bg-[#0E1716] text-[#EEF2EF] print:bg-white print:text-black">
      <header className="border-b border-white/10 px-5 py-3 print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold">{venue?.name ?? "Venue"}</p>
            <p className="text-sm text-white/60">{venue?.city}</p>
          </div>
          {venues.length > 1 && (
            <select
              className="rounded-md bg-white/10 px-3 py-2"
              aria-label="Venue"
              value={venueId ?? ""}
              onChange={(e) => {
                setVenueId(e.target.value);
                try {
                  localStorage.setItem("md-venue", e.target.value);
                } catch {
                  /* ignore */
                }
              }}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id} className="text-black">{v.name}</option>
              ))}
            </select>
          )}
          {venueId && (
            <Link href={`/venue/tv?venue=${venueId}`} target="_blank" className="rounded-md bg-[#FFB020] px-4 py-2 font-bold text-black">
              Open TV screen
            </Link>
          )}
          <button className="rounded-md border border-white/20 px-3 py-2 text-sm" onClick={() => supabase().auth.signOut()}>
            Sign out
          </button>
        </div>
        <nav className="mt-3 flex flex-wrap gap-1" aria-label="Venue sections">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${path === l.href ? "bg-white text-black" : "text-white/75 hover:bg-white/10"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <AccountBanner account={account} venue={venue} />
      {children({ staff, venueId, venue, account, refresh: () => setVersion((v) => v + 1) })}
    </div>
  );
}

function AccountBanner({ account, venue }: { account: VenueAccount | null | undefined; venue: Venue | null }) {
  if (!account || !venue) return null;
  const msg: Record<string, { text: string; tone: string } | null> = {
    pending: { text: "Thanks for signing up. We're reviewing your venue and will call you within one working day. You can set up tables and coasters meanwhile; players can join once you're approved.", tone: "bg-[#FFB020] text-black" },
    trial: { text: `You're on a free trial${account.paid_until ? ` until ${fmt(account.paid_until)}` : ""}. Pick a plan on Plan & billing to keep playing after that.`, tone: "bg-[#7FE0C8] text-black" },
    past_due: { text: "Your plan has ended. Renew on Plan & billing to keep the game running.", tone: "bg-red-500 text-white" },
    cancelled: { text: "This venue is paused. Contact us to switch it back on.", tone: "bg-red-500 text-white" },
    active: null,
  };
  const m = msg[account.status];
  if (!m) return null;
  return (
    <div className={`px-5 py-3 text-sm font-semibold print:hidden ${m.tone}`} role="status">
      {m.text}{" "}
      {account.status !== "pending" && account.status !== "cancelled" && (
        <Link href="/venue/billing" className="underline">Go to Plan & billing</Link>
      )}
    </div>
  );
}

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
