"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import { ErrorNote } from "./ui";

export type Group = { id: string; code: string; name: string; members: number; is_owner: boolean };

/** The player's groups, kept fresh across screens. */
export function useMyGroups() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const reload = useCallback(async () => {
    const { data } = await supabase().rpc("my_groups");
    setGroups((data as Group[]) ?? []);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { groups, reload };
}

export function groupLink(code: string) {
  return `${typeof window === "undefined" ? "" : window.location.origin}/g/${code}`;
}

export async function shareGroup(g: Pick<Group, "code" | "name">): Promise<"shared" | "copied" | "failed"> {
  const url = groupLink(g.code);
  const text = `Join my group "${g.name}" on SportsAura and let's see who calls the match best. Code: ${g.code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: g.name, text, url });
      return "shared";
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Create a group, join one with a code, share or leave your groups. */
export function GroupsPanel({ groups, onChanged, onOpen }: { groups: Group[]; onChanged: () => void; onOpen?: (id: string) => void }) {
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("create_group", { p_name: name.trim() });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    const g = (data as Group[])[0];
    setMode("none");
    setName("");
    onChanged();
    onOpen?.(g.id);
    const r = await shareGroup(g);
    setNote(r === "copied" ? `Group made. Invite link copied: send it to your friends.` : `Group made. Code ${g.code}: share it with your friends.`);
  }

  async function join() {
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("join_group", { p_code: code.trim() });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    const g = (data as Group[])[0];
    setMode("none");
    setCode("");
    setNote(`You're in ${g.name}.`);
    onChanged();
    onOpen?.(g.id);
  }

  async function leave(g: Group) {
    if (!confirm(`Leave ${g.name}?`)) return;
    const { error } = await supabase().rpc("leave_group", { p_group: g.id });
    if (error) return setError(friendlyError(error));
    onChanged();
  }

  async function share(g: Group) {
    const r = await shareGroup(g);
    if (r === "copied") setNote("Invite link copied.");
    if (r === "failed") setNote(`Share this code: ${g.code}`);
  }

  return (
    <section aria-labelledby="groups-h" className="rounded-3xl border border-ink/15 p-5">
      <h2 id="groups-h" className="font-display text-2xl font-bold">
        Your groups
      </h2>
      <p className="mt-1 text-[15px] text-ink/70">Play against just your friends, your office or your bar. Each group gets its own leaderboard.</p>

      {groups.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-2xl bg-surface/70 px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen?.(g.id)} disabled={!onOpen}>
                <span className="block truncate text-lg font-semibold">{g.name}</span>
                <span className="block text-sm text-ink/60">
                  Code <span className="tabular font-semibold tracking-wider text-ink/85">{g.code}</span> · {g.members} {g.members === 1 ? "member" : "members"}
                </span>
              </button>
              <button className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-on-brand" onClick={() => share(g)}>
                Invite
              </button>
              <button className="px-1 text-sm text-ink/55 underline" onClick={() => leave(g)} aria-label={`Leave ${g.name}`}>
                Leave
              </button>
            </li>
          ))}
        </ul>
      )}

      {mode === "none" && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="rounded-2xl bg-brand py-3 font-display text-xl font-bold text-on-brand" onClick={() => { setMode("create"); setNote(""); }}>
            Create
          </button>
          <button className="rounded-2xl border-2 border-ink/25 py-3 font-display text-xl font-bold" onClick={() => { setMode("join"); setNote(""); }}>
            Join with code
          </button>
        </div>
      )}

      {mode === "create" && (
        <form className="mt-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <label className="text-sm font-semibold text-ink/80" htmlFor="group-name">Group name</label>
          <input
            id="group-name"
            autoFocus
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Office cricket gang"
            className="rounded-xl border border-ink/25 bg-black/25 px-4 py-3 text-lg"
          />
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl border border-ink/25 py-3 font-semibold" onClick={() => setMode("none")}>Cancel</button>
            <button className="rounded-xl bg-brand py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy || name.trim().length < 2}>
              {busy ? "Creating" : "Create group"}
            </button>
          </div>
        </form>
      )}

      {mode === "join" && (
        <form className="mt-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); join(); }}>
          <label className="text-sm font-semibold text-ink/80" htmlFor="group-code">6-letter group code</label>
          <input
            id="group-code"
            autoFocus
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="ABC234"
            className="tabular rounded-xl border border-ink/25 bg-black/25 px-4 py-3 text-center font-display text-3xl font-bold tracking-[0.3em]"
          />
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" className="rounded-xl border border-ink/25 py-3 font-semibold" onClick={() => setMode("none")}>Cancel</button>
            <button className="rounded-xl bg-brand py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy || code.length !== 6}>
              {busy ? "Joining" : "Join group"}
            </button>
          </div>
        </form>
      )}

      {note && <p className="mt-3 rounded-xl bg-brand/15 px-4 py-3 text-[15px] font-medium" role="status">{note}</p>}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
  );
}
