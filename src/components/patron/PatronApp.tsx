"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { themeVars } from "@/lib/theme";
import type { Match, Profile, Sponsor, Theme, Venue } from "@/lib/types";
import { PhoneLogin } from "./PhoneLogin";
import { Onboarding } from "./Onboarding";
import { VerifyPresence, getPosition } from "./VerifyPresence";
import { PlayTab } from "./PlayTab";
import { LeaderboardTab } from "./LeaderboardTab";
import { WalletTab } from "./WalletTab";
import { OffersTab } from "./OffersTab";
import { MoreTab } from "./MoreTab";
import { Spinner } from "./ui";
import { HowToPlayTour } from "./HowToPlayTour";

type Tab = "play" | "ranks" | "wallet" | "offers" | "more";
type Presence = "unknown" | "verify" | "ok";

const HEARTBEAT_MS = 120_000;
const QR_KEY = "md-qr-ticket";
const tourKey = (userId: string) => `md-tour-seen-${userId}`;

function tourSeen(userId: string): boolean {
  try {
    return localStorage.getItem(tourKey(userId)) === "1";
  } catch {
    return true; // storage blocked: don't nag every visit
  }
}
function markTourSeen(userId: string) {
  try {
    localStorage.setItem(tourKey(userId), "1");
  } catch {
    /* ignore */
  }
}
type Method = "gps" | "pin" | "qr";
type QrTicket = { ticket: string; venueId: string; expiresAt: string };

function readTicket(): QrTicket | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(QR_KEY) || "null") as QrTicket | null;
    return t && new Date(t.expiresAt) > new Date() ? t : null;
  } catch {
    return null;
  }
}
function clearTicket() {
  try {
    sessionStorage.removeItem(QR_KEY);
  } catch {
    /* ignore */
  }
}

async function geoGranted(): Promise<boolean> {
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return p?.state === "granted";
  } catch {
    return false;
  }
}

export function PatronApp({ slug }: { slug: string }) {
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  const [match, setMatch] = useState<Match | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [presence, setPresence] = useState<Presence>("unknown");
  const [returning, setReturning] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [points, setPoints] = useState(0);
  const [tab, setTab] = useState<Tab>("play");
  const [qrExpired, setQrExpired] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [sponsor, setSponsor] = useState<Pick<Sponsor, "name" | "logo_url"> | null>(null);
  const [tableHint, setTableHint] = useState<number | null>(null);

  // Table coaster (?t=12): remember the table for this visit.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = Number(params.get("t"));
    let n: number | null = Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : null;
    try {
      if (n) sessionStorage.setItem("md-table", String(n));
      else n = Number(sessionStorage.getItem("md-table")) || null;
    } catch {
      /* ignore */
    }
    setTableHint(n);
  }, []);

  // First time this account plays on this phone: show the walkthrough.
  useEffect(() => {
    if (profile && !tourSeen(profile.id)) setShowTour(true);
  }, [profile]);

  const closeTour = useCallback(() => {
    if (profile) markTourSeen(profile.id);
    setShowTour(false);
  }, [profile]);
  const [qrClaiming, setQrClaiming] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("k"),
  );

  // Scanned the TV QR? Swap the 30-second code for a 15-minute single-use
  // ticket right away, so a new player has time to log in first.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("k");
    if (!code) return setQrClaiming(false);
    params.delete("k");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    supabase()
      .rpc("claim_qr_ticket", { p_venue_slug: slug, p_code: code })
      .then(({ data }) => {
        const r = (data as { ticket: string; venue_id: string; expires_at: string }[] | null)?.[0];
        if (!r) setQrExpired(true);
        else {
          try {
            sessionStorage.setItem(QR_KEY, JSON.stringify({ ticket: r.ticket, venueId: r.venue_id, expiresAt: r.expires_at }));
          } catch {
            /* private mode: player falls back to GPS or PIN */
          }
        }
        setQrClaiming(false);
      });
  }, [slug]);

  // Venue, live match, theme (match sponsor theme wins over venue default)
  useEffect(() => {
    const sb = supabase();
    (async () => {
      const { data: v } = await sb
        .from("venues")
        .select("id, name, slug, address, city, geofence_radius_m, default_theme_id, is_active, table_count")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (!v) return setVenue(null);
      const { data: m } = await sb
        .from("matches")
        .select("id, title, sport, starts_at, status, theme_id, reward_set_id, sponsor_id, current_over")
        .eq("status", "live")
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const themeId = (m as Match | null)?.theme_id ?? (v as Venue).default_theme_id;
      if (themeId) {
        const { data: t } = await sb.from("themes").select("*").eq("id", themeId).maybeSingle();
        setTheme(t as Theme | null);
      }
      const sid = (m as Match | null)?.sponsor_id;
      if (sid) {
        const { data: sp } = await sb.from("sponsors").select("name, logo_url").eq("id", sid).maybeSingle();
        setSponsor(sp as Pick<Sponsor, "name" | "logo_url"> | null);
      }
      setMatch(m as Match | null);
      setVenue(v as Venue);
    })();
  }, [slug]);

  // React to the match going live or ending without a reload
  useEffect(() => {
    const sb = supabase();
    const ch = sb
      .channel("matches")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, ({ new: m }) => {
        const next = m as Match;
        setMatch((cur) => {
          if (next.status === "live") return cur && cur.id !== next.id ? cur : next;
          return cur?.id === next.id ? null : cur;
        });
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, []);

  // Auth
  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Profile
  useEffect(() => {
    if (!session) {
      if (session === null) setProfile(null);
      return;
    }
    supabase()
      .from("users")
      .select("id, display_name, age_verified_21, age_verified_25, consent_agreed_at, marketing_consent_at")
      .eq("id", session.user.id)
      .is("deleted_at", null)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile) ?? null));
  }, [session]);

  // Existing check-in for this match?
  const heartbeat = useCallback(
    async (silentGps: boolean) => {
      if (!match || !venue) return;
      let lat: number | null = null;
      let lng: number | null = null;
      if (silentGps && (await geoGranted())) {
        try {
          const p = await getPosition();
          lat = p.coords.latitude;
          lng = p.coords.longitude;
        } catch {
          /* no fix right now: the server keeps the session */
        }
      }
      const { data } = await supabase().rpc("session_heartbeat", {
        p_match_id: match.id,
        p_lat: lat,
        p_lng: lng,
      });
      const r = (data as { active: boolean; points_total: number; venue_id: string | null }[] | null)?.[0];
      if (r?.active && r.venue_id === venue.id) {
        setPoints(r.points_total);
        setPresence("ok");
        return;
      }
      const t = readTicket();
      if (t && t.venueId === venue.id) {
        const { data: q } = await supabase().rpc("verify_presence_qr", { p_ticket: t.ticket, p_match_id: match.id });
        clearTicket();
        if ((q as { ok: boolean }[] | null)?.[0]?.ok) {
          setMethod("qr");
          setPoints(r?.points_total ?? 0);
          setPresence("ok");
          return;
        }
        setQrExpired(true);
      }
      setReturning(Boolean(r?.venue_id));
      setPresence("verify");
    },
    [match, venue],
  );

  useEffect(() => {
    if (!profile || !match || qrClaiming) return;
    (async () => {
      const { data } = await supabase()
        .from("player_sessions")
        .select("verification_method")
        .eq("user_id", profile.id)
        .eq("match_id", match.id)
        .maybeSingle();
      setMethod((data?.verification_method as Method) ?? null);
      heartbeat(false);
    })();
  }, [profile, match, heartbeat, qrClaiming]);

  useEffect(() => {
    if (presence !== "ok") return;
    const t = setInterval(() => heartbeat(method === "gps"), HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [presence, method, heartbeat]);

  const refreshPoints = useCallback(async () => {
    if (!match || !profile) return;
    const { data } = await supabase()
      .from("player_sessions")
      .select("points_total")
      .eq("user_id", profile.id)
      .eq("match_id", match.id)
      .maybeSingle();
    if (data) setPoints(data.points_total);
  }, [match, profile]);

  const style = themeVars(theme);

  // ---------- gates ----------
  if (venue === undefined || session === undefined || (session && profile === undefined)) {
    return (
      <Shell style={style}>
        <Spinner label="Opening" />
      </Shell>
    );
  }
  if (venue === null) {
    return (
      <Shell style={style}>
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="font-display text-4xl font-bold">This coaster isn&apos;t linked to an active venue</h1>
          <p className="mt-3 text-ink/70">Ask the staff for a fresh code.</p>
        </div>
      </Shell>
    );
  }
  if (!session) return <Shell style={style}><PhoneLogin venueName={venue.name} /></Shell>;
  if (!profile) return <Shell style={style}><Onboarding onDone={setProfile} /></Shell>;

  // ---------- app ----------
  let playContent: ReactNode;
  if (!match) {
    playContent = (
      <div className="px-6 py-16 text-center">
        <p className="font-display text-4xl font-bold">No live match right now</p>
        <p className="mt-3 text-[17px] text-ink/70">
          Predictions open when the next match starts at {venue.name}. Your wallet and rewards are always here.
        </p>
      </div>
    );
  } else if (presence === "unknown") {
    playContent = <Spinner label="Checking you in" />;
  } else if (presence === "verify") {
    playContent = (
      <VerifyPresence
        venue={venue}
        match={match}
        returning={returning}
        qrExpired={qrExpired}
        onVerified={(m) => {
          setMethod(m);
          setPresence("ok");
          refreshPoints();
        }}
      />
    );
  } else {
    playContent = (
      <PlayTab
        venue={venue}
        match={match}
        onPointsChanged={refreshPoints}
        tableHint={tableHint}
        onNeedsVerify={() => {
          setReturning(true);
          setPresence("verify");
        }}
      />
    );
  }

  return (
    <Shell style={style}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          {theme?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logo_url} alt={theme.sponsor_name ?? ""} className="h-9 w-auto max-w-24 object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-bold leading-tight">{match?.title ?? venue.name}</p>
            <p className="truncate text-sm text-ink/65">
              {venue.name}
              {sponsor ? ` · presented by ${sponsor.name}` : theme?.sponsor_name ? ` with ${theme.sponsor_name}` : ""}
            </p>
          </div>
          {presence === "ok" && match && (
            <div className="rounded-xl bg-black/30 px-3 py-1.5 text-right">
              <span className="tabular block font-display text-2xl font-bold leading-none text-brand">{points}</span>
              <span className="text-xs text-ink/70">points</span>
            </div>
          )}
        </header>

        <main className="flex-1 pb-28">
          {tab === "play" && playContent}
          {tab === "ranks" && <LeaderboardTab venue={venue} match={match} />}
          {tab === "wallet" && <WalletTab />}
          {tab === "offers" && <OffersTab venueId={venue.id} />}
          {tab === "more" && <MoreTab profile={profile} onProfile={setProfile} onReplayTour={() => setShowTour(true)} />}
        </main>

        <BottomNav tab={tab} onTab={setTab} />
        <AnimatePresence>{showTour && <HowToPlayTour onClose={closeTour} />}</AnimatePresence>
      </div>
    </Shell>
  );
}

function Shell({ style, children }: { style: React.CSSProperties; children: ReactNode }) {
  return (
    <div className="brand-canvas min-h-dvh" style={style}>
      {children}
    </div>
  );
}

const NAV: { key: Tab; label: string; icon: ReactNode }[] = [
  {
    key: "play",
    label: "Play",
    icon: <path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2" />,
  },
  { key: "ranks", label: "Ranks", icon: <path d="M5 20V12M12 20V6M19 20v-5" /> },
  {
    key: "wallet",
    label: "Wallet",
    icon: <path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Zm0 0 11-3v3m1 6h.01" />,
  },
  { key: "offers", label: "Offers", icon: <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8-8-8Zm4-4h.01" /> },
  { key: "more", label: "More", icon: <path d="M5 12h.01M12 12h.01M19 12h.01" /> },
];

function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-ink/10 bg-black/55 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
      aria-label="Main"
    >
      <ul className="grid grid-cols-5">
        {NAV.map((n) => {
          const on = tab === n.key;
          return (
            <li key={n.key}>
              <button
                onClick={() => onTab(n.key)}
                aria-current={on ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-semibold ${
                  on ? "text-brand" : "text-ink/60"
                }`}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {n.icon}
                </svg>
                {n.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
