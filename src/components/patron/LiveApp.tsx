"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { themeVars } from "@/lib/theme";
import type { Match, Profile, Sponsor, Theme } from "@/lib/types";
import { PhoneLogin } from "./PhoneLogin";
import { Onboarding } from "./Onboarding";
import { PlayTab } from "./PlayTab";
import { LeaderboardTab } from "./LeaderboardTab";
import { AppNav } from "@/components/AppNav";
import { Spinner } from "./ui";
import { HowToPlayTour } from "./HowToPlayTour";

type Tab = "play" | "ranks";
const MATCH_COLS = "id, title, sport, starts_at, status, theme_id, sponsor_id, series_id, published_at";
const tourKey = (userId: string) => `md-tour-seen-${userId}`;

function tourSeen(userId: string): boolean {
  try {
    return localStorage.getItem(tourKey(userId)) === "1";
  } catch {
    return true; // storage blocked: don't show it on every visit
  }
}
function markTourSeen(userId: string) {
  try {
    localStorage.setItem(tourKey(userId), "1");
  } catch {
    /* ignore */
  }
}

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const day =
    d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === tomorrow.toDateString() ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
};

/** The Live tab: the match on now (or what's coming up), then play and leaderboards. */
export function LiveApp() {
  const [live, setLive] = useState<Match[] | null>(null);
  const [upcoming, setUpcoming] = useState<Match[]>([]);
  const [picked, setPicked] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("m")));
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  const loadMatches = useCallback(async () => {
    const sb = supabase();
    const [{ data: l }, { data: u }] = await Promise.all([
      sb.from("matches").select(MATCH_COLS).eq("status", "live").not("published_at", "is", null).order("starts_at"),
      sb
        .from("matches")
        .select(MATCH_COLS)
        .eq("status", "scheduled")
        .not("published_at", "is", null)
        .gte("starts_at", new Date(Date.now() - 6 * 3600000).toISOString())
        .order("starts_at")
        .limit(6),
    ]);
    setLive((l as Match[]) ?? []);
    setUpcoming((u as Match[]) ?? []);
  }, []);

  // Matches, and changes to them (a match starting or ending) without a reload.
  useEffect(() => {
    loadMatches();
    const sb = supabase();
    const ch = sb
      .channel("live-matches")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches" }, () => loadMatches())
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [loadMatches]);

  // Auth and profile
  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
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

  // A match picked from a link may have ended since: fetch it directly.
  const [pickedMatch, setPickedMatch] = useState<Match | null>(null);
  useEffect(() => {
    if (!picked || live?.some((m) => m.id === picked)) return setPickedMatch(null);
    supabase()
      .from("matches")
      .select(MATCH_COLS)
      .eq("id", picked)
      .not("published_at", "is", null)
      .maybeSingle()
      .then(({ data }) => setPickedMatch((data as Match) ?? null));
  }, [picked, live]);

  const selected = live?.find((m) => m.id === picked) ?? pickedMatch ?? (live?.length === 1 ? live[0] : null);

  if (live === null || session === undefined || (session && profile === undefined)) {
    return (
      <Shell>
        <Spinner label="Opening" />
      </Shell>
    );
  }

  if (!selected) {
    return (
      <Shell>
        <Schedule live={live} upcoming={upcoming} onPick={setPicked} />
      </Shell>
    );
  }

  if (!session)
    return (
      <Shell>
        <PhoneLogin heading={`${selected.title} is live`} intro="Sign in with your mobile number to play. It takes 20 seconds, and you only do it once." />
      </Shell>
    );
  if (!profile)
    return (
      <Shell>
        <Onboarding onDone={setProfile} />
      </Shell>
    );

  return <MatchView key={selected.id} match={selected} profile={profile} otherLive={live.filter((m) => m.id !== selected.id)} onPick={setPicked} />;
}

// ------------------------------------------------------------------ no match picked
function Schedule({ live, upcoming, onPick }: { live: Match[]; upcoming: Match[]; onPick: (id: string) => void }) {
  return (
    <div className="mx-auto max-w-md px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      {live.length > 1 ? (
        <>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">Live now</p>
          <h1 className="mt-2 font-display text-5xl font-bold leading-[0.95]">Pick your match</h1>
          <ul className="mt-6 flex flex-col gap-3">
            {live.map((m) => (
              <li key={m.id}>
                <button onClick={() => onPick(m.id)} className="flex w-full items-center justify-between rounded-3xl bg-brand px-5 py-5 text-left text-on-brand">
                  <span>
                    <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider opacity-80">
                      <span className="size-2 animate-pulse rounded-full bg-current" aria-hidden /> Live
                    </span>
                    <span className="mt-1 block font-display text-3xl font-bold leading-tight">{m.title}</span>
                  </span>
                  <span aria-hidden className="text-3xl">›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold uppercase tracking-widest text-brand">Live</p>
          <h1 className="mt-2 font-display text-5xl font-bold leading-[0.95]">No match on right now</h1>
          <p className="mt-3 text-[17px] text-ink/70">Questions start when the next match goes live. Come back here then, from anywhere.</p>
        </>
      )}

      {upcoming.length > 0 && (
        <section className="mt-10" aria-labelledby="next-h">
          <h2 id="next-h" className="font-display text-2xl font-bold">
            Coming up
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-ink/10 rounded-2xl bg-surface/70">
            {upcoming.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <p className="font-semibold">{m.title}</p>
                <p className="text-sm text-ink/65">{when(m.starts_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/play" className="mt-8 block rounded-3xl border border-ink/15 bg-black/20 p-5">
        <span className="text-sm font-semibold uppercase tracking-widest text-brand">While you wait</span>
        <span className="mt-1 block font-display text-3xl font-bold leading-none">Trivia with friends</span>
        <span className="mt-2 block text-[15px] text-ink/70">Make a room, share the code, play anywhere.</span>
      </Link>
    </div>
  );
}

// ------------------------------------------------------------------ one match
function MatchView({ match: initial, profile, otherLive, onPick }: { match: Match; profile: Profile; otherLive: Match[]; onPick: (id: string) => void }) {
  const [match, setMatch] = useState<Match>(initial);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [sponsor, setSponsor] = useState<Pick<Sponsor, "name" | "logo_url"> | null>(null);
  const [seriesName, setSeriesName] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "ranks" ? "ranks" : "play"));
  const [showTour, setShowTour] = useState(false);

  useEffect(() => setMatch(initial), [initial]);

  // Look and sponsor, and the series name for the leaderboard.
  useEffect(() => {
    const sb = supabase();
    if (match.theme_id) sb.from("themes").select("*").eq("id", match.theme_id).maybeSingle().then(({ data }) => setTheme(data as Theme | null));
    if (match.sponsor_id) sb.from("sponsors").select("name, logo_url").eq("id", match.sponsor_id).maybeSingle().then(({ data }) => setSponsor(data));
    if (match.series_id) sb.from("series").select("name").eq("id", match.series_id).maybeSingle().then(({ data }) => setSeriesName(data?.name ?? null));
  }, [match.theme_id, match.sponsor_id, match.series_id]);

  // Join the match (no check-in needed), and keep the score current.
  const refreshPoints = useCallback(async () => {
    const { data } = await supabase().from("player_sessions").select("points_total").eq("user_id", profile.id).eq("match_id", match.id).maybeSingle();
    setPoints(data?.points_total ?? 0);
  }, [match.id, profile.id]);

  useEffect(() => {
    if (match.status !== "live") {
      refreshPoints();
      return;
    }
    supabase()
      .rpc("join_match", { p_match_id: match.id })
      .then(({ data }) => setPoints(((data as { points_total: number }[] | null)?.[0]?.points_total ?? 0)));
  }, [match.id, match.status, refreshPoints]);

  // First time this account plays on this phone: show the walkthrough.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("tour") === "1";
    if (asked || !tourSeen(profile.id)) setShowTour(true);
  }, [profile.id]);
  const closeTour = useCallback(() => {
    markTourSeen(profile.id);
    setShowTour(false);
  }, [profile.id]);

  const style = themeVars(theme);
  const partners = theme?.partner_logos?.filter(Boolean) ?? [];

  return (
    <div className="brand-canvas min-h-dvh" style={style}>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          {theme?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logo_url} alt={theme.sponsor_name ?? ""} decoding="async" className="h-9 w-auto max-w-24 object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-bold leading-tight">{match.title}</p>
            <p className="flex items-center gap-1.5 truncate text-sm text-ink/65">
              {match.status === "live" && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand" aria-hidden />}
              {match.status === "live" ? "Live" : "Full time"}
              {sponsor ? ` · presented by ${sponsor.name}` : theme?.sponsor_name ? ` · with ${theme.sponsor_name}` : ""}
            </p>
          </div>
          <div className="rounded-xl bg-black/30 px-3 py-1.5 text-right" aria-label={`${points ?? 0} points`}>
            <span className="tabular block font-display text-2xl font-bold leading-none text-brand">{points ?? "–"}</span>
            <span className="text-xs text-ink/70">points</span>
          </div>
        </header>

        <div className="sticky top-[4.5rem] z-10 px-5 pb-2 backdrop-blur-md" role="tablist" aria-label="Match">
          <div className="grid grid-cols-2 rounded-xl bg-black/30 p-1">
            {(
              [
                ["play", "Play"],
                ["ranks", "Leaderboard"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-lg py-2.5 font-semibold ${tab === k ? "bg-brand text-on-brand" : "text-ink/70"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {otherLive.length > 0 && (
          <div className="-mb-1 flex gap-2 overflow-x-auto px-5 pt-1 text-sm">
            <span className="shrink-0 py-1 text-ink/60">Also live:</span>
            {otherLive.map((m) => (
              <button key={m.id} onClick={() => onPick(m.id)} className="shrink-0 rounded-full border border-ink/25 px-3 py-1 font-semibold">
                {m.title}
              </button>
            ))}
          </div>
        )}

        <main className="flex-1 pb-32">
          {tab === "play" && theme?.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.banner_url} alt={theme.sponsor_name ?? ""} width={1200} height={400} decoding="async" className="mx-5 mb-1 mt-3 block aspect-[3/1] w-[calc(100%-2.5rem)] rounded-2xl object-cover" />
          )}
          {tab === "play" && <PlayTab match={match} onPointsChanged={refreshPoints} />}
          {tab === "play" && partners.length > 0 && (
            <Partners logos={partners} />
          )}
          {tab === "ranks" && <LeaderboardTab match={match} seriesName={seriesName} />}
        </main>

        <AppNav />
        <AnimatePresence>{showTour && <HowToPlayTour onClose={closeTour} />}</AnimatePresence>
      </div>
    </div>
  );
}

function Partners({ logos }: { logos: string[] }) {
  return (
    <div className="mx-5 mt-2 flex flex-wrap items-center gap-3 rounded-2xl bg-black/25 px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-ink/65">In partnership with</span>
      {logos.map((u) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt="" loading="lazy" decoding="async" className="h-7 w-auto max-w-20 object-contain" />
      ))}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="brand-canvas min-h-dvh pb-24">
      {children}
      <AppNav />
    </div>
  );
}
