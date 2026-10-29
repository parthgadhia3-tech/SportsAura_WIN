"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { themeVars } from "@/lib/theme";
import type { Profile } from "@/lib/types";
import { PhoneLogin } from "@/components/patron/PhoneLogin";
import { Onboarding } from "@/components/patron/Onboarding";
import { Spinner } from "@/components/patron/ui";

export type Mode = "classic" | "speed" | "hotseat" | "pass" | "topics" | "teams";

export const MODES: { key: Mode; name: string; emoji: string; blurb: string }[] = [
  { key: "classic", name: "Classic", emoji: "🏆", blurb: "Everyone answers. Fastest right answer scores most." },
  { key: "speed", name: "Speed round", emoji: "⚡", blurb: "5 seconds a question. Pure chaos." },
  { key: "hotseat", name: "Hot seat", emoji: "🔥", blurb: "One player answers. Everyone else predicts if they get it right." },
  { key: "pass", name: "Pass the phone", emoji: "📱", blurb: "One phone, everyone takes turns." },
  { key: "topics", name: "Topic wars", emoji: "⚔️", blurb: "Each player picks a category for the round." },
  { key: "teams", name: "Team vs team", emoji: "🤝", blurb: "Split the room into two sides." },
];
export const modeInfo = (m: string) => MODES.find((x) => x.key === m) ?? MODES[0];

export type RoomPlayer = {
  id: string;
  name: string;
  team: "A" | "B" | null;
  score: number;
  correct: number;
  wrong: number;
  answered: number;
  avg_ms: number | null;
  is_me: boolean;
  is_guest: boolean;
  is_host: boolean;
  topic: string | null;
};
export type RoomState = {
  server_now: string;
  code: string;
  name: string;
  mode: Mode;
  status: "lobby" | "playing" | "finished";
  solo: boolean;
  daily: boolean;
  seconds: number;
  count: number;
  total: number;
  idx: number;
  is_host: boolean;
  me: string | null;
  custom_topic: string | null;
  rematch_code: string | null;
  venue: string | null;
  categories: { id: string; name: string; emoji: string }[];
  players: RoomPlayer[];
  reactions: { id: number; emoji: string; name: string }[];
  current: null | {
    idx: number;
    prompt: string;
    options: string[];
    category: null | { name: string; emoji: string; sponsor: null | { name: string; logo_url: string | null; tagline: string | null } };
    started_at: string;
    locks_at: string;
    revealed: boolean;
    revealed_at: string | null;
    voided: boolean;
    hot_player_id: string | null;
    answers: number;
    mine: null | { player_id: string; option: number | null; predict: boolean | null; is_correct: boolean | null; points: number | null }[];
    correct_option: number | null;
    explanation: string | null;
    source_url: string | null;
    source_title: string | null;
    ai: boolean;
    split: number[] | null;
  };
};

/** Plays this room: polls the server engine about once a second and keeps a clock offset. */
export function useRoom(code: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  const offset = useRef(0);
  const inflight = useRef(false);

  const tick = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    const t0 = Date.now();
    const { data, error } = await supabase().rpc("room_tick", { p_code: code });
    inflight.current = false;
    if (error) return setError(error.message);
    const s = data as RoomState;
    offset.current = new Date(s.server_now).getTime() - (t0 + (Date.now() - t0) / 2);
    setError("");
    setState(s);
  }, [code]);

  useEffect(() => {
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [tick]);

  const now = () => Date.now() + offset.current;
  return { state, error, tick, now };
}

export function useClock(ms = 200) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

// ---------------------------------------------------------------- sound + buzz
let ctx: AudioContext | null = null;
export function soundOn() {
  try {
    return localStorage.getItem("md-sound") !== "0";
  } catch {
    return true;
  }
}
export function setSound(on: boolean) {
  try {
    localStorage.setItem("md-sound", on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
/** Tiny synthesized sounds, no audio files to download. */
export function beep(kind: "tick" | "right" | "wrong" | "start" | "win") {
  if (!soundOn() || typeof window === "undefined") return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes: Record<string, [number, number][]> = {
      tick: [[880, 0.05]],
      start: [[523, 0.1], [659, 0.1], [784, 0.15]],
      right: [[659, 0.09], [988, 0.18]],
      wrong: [[220, 0.25]],
      win: [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.3]],
    };
    let t = ctx.currentTime;
    for (const [f, d] of notes[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === "wrong" ? "sawtooth" : "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + d);
      t += d * 0.9;
    }
  } catch {
    /* audio blocked: silent */
  }
}
export const buzz = (ms: number | number[]) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
};

// ---------------------------------------------------------------- sign-in gate
export function PlayShell({ children }: { children: (ctx: { profile: Profile }) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

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

  let body: ReactNode;
  if (session === undefined || (session && profile === undefined)) body = <Spinner label="Opening" />;
  else if (!session)
    body = (
      <PhoneLogin
        heading="Quiz your friends. Anywhere."
        intro="Free trivia rooms for your group: cricket, Bollywood, current affairs or any topic you like. Your mobile number is your login."
      />
    );
  else if (!profile) body = <Onboarding onDone={setProfile} />;
  else body = children({ profile });

  return (
    <div className="brand-canvas min-h-dvh" style={themeVars(null)}>
      {body}
    </div>
  );
}

export async function playerPost(path: string, body: unknown) {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export const playErrors: Record<string, string> = {
  code_taken: "That room code is taken. Try another.",
  room_not_found: "No room with that code. Check it with your friend.",
  room_finished: "That game has finished. Ask for the rematch code.",
  room_full: "This room is full (30 players).",
  pass_mode_one_phone: "This room is played on one phone. Ask the host to add you.",
  not_enough_questions: "Not enough checked questions for that choice yet. Pick another category or add one.",
  pick_a_category: "Pick at least one category, or type your own topic.",
  add_players: "Add at least one more player's name.",
  teams_need_players: "Both teams need at least one player.",
  too_many_rooms: "You've made a lot of rooms today. Rejoin a recent one.",
  host_only: "Only the host can do that.",
  question_closed: "Too late, that question has closed.",
  already_answered: "You've already answered.",
  not_your_turn: "It's someone else's turn.",
  not_in_room: "Join the room first.",
  topic_length: "Keep the topic between 3 and 60 characters.",
};
export function playError(raw: unknown) {
  const msg = typeof raw === "string" ? raw : (raw as { message?: string })?.message ?? "";
  for (const k of Object.keys(playErrors)) if (msg.includes(k)) return playErrors[k];
  return msg || "Something went wrong. Try again.";
}
