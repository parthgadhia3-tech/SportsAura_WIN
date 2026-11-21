"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import type { Match, RewardSet, Series, Sponsor, Theme } from "@/lib/types";
import { ThemeEditor, ThemePreview } from "./AdminPanels";
import { ImageUpload } from "./ImageUpload";

/**
 * The set-up funnel: 1 Series → 2 Theme → 3 Matches → 4 Publish.
 * Each step unlocks only when the one before it is complete, and a match can
 * only be published (and so started in Live) when the server checklist is empty.
 */

type Step = 1 | 2 | 3 | 4;
const SPORTS = ["cricket", "football", "kabaddi", "f1", "tennis", "other"];

const CHECK_LABEL: Record<string, { label: string; step: Step }> = {
  series: { label: "Match belongs to this series", step: 3 },
  sponsor: { label: "Title sponsor chosen, or marked as none", step: 1 },
  sponsor_logo: { label: "Title sponsor has a logo", step: 1 },
  sponsor_paused: { label: "Title sponsor is active, not paused", step: 1 },
  theme: { label: "Series has a theme", step: 2 },
  theme_logo: { label: "Theme sponsor logo uploaded", step: 2 },
  match_title: { label: "Match has a title", step: 3 },
  match_dates: { label: "Match date falls inside the series dates", step: 3 },
  rewards: { label: "Rewards chosen for the match", step: 3 },
  reward_set: { label: "Reward set picked", step: 3 },
};

function useStatus() {
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  return {
    ok: (text: string) => {
      setMsg({ text, bad: false });
      setTimeout(() => setMsg(null), 2500);
    },
    fail: (e: unknown) => setMsg({ text: friendlyError(e), bad: true }),
    node: msg ? (
      <p className={`rounded-lg px-4 py-2 text-sm font-medium ${msg.bad ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-900"}`} role="status">
        {msg.text}
      </p>
    ) : null,
  };
}

function Panel({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#d8dedb] bg-white p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {intro && <p className="mb-3 mt-1 text-sm text-[#5b6865]">{intro}</p>}
      {children}
    </section>
  );
}

const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { dateStyle: "medium" });

function matchState(m: Match): { label: string; cls: string } {
  if (m.status === "live") return { label: "Live", cls: "bg-emerald-600 text-white" };
  if (m.status === "ended") return { label: "Ended", cls: "bg-[#d8dedb] text-[#3b4745]" };
  if (m.published_at) return { label: "Published", cls: "bg-[#17201f] text-white" };
  return { label: "Draft", cls: "bg-amber-100 text-amber-900" };
}

// ====================================================================
export function SetupFlow({ onOpenLive }: { onOpenLive: () => void }) {
  const [series, setSeries] = useState<Series[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sets, setSets] = useState<RewardSet[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: se }, { data: th }, { data: sp }, { data: rs }, { data: ms }] = await Promise.all([
      sb.from("series").select("*").order("starts_on", { ascending: false }),
      sb.from("themes").select("*").order("name"),
      sb.from("sponsors").select("*").order("name"),
      sb.from("reward_sets").select("*").eq("is_active", true).order("code"),
      sb.from("matches").select("*").order("starts_at"),
    ]);
    setSeries((se as Series[]) ?? []);
    setThemes((th as Theme[]) ?? []);
    setSponsors((sp as Sponsor[]) ?? []);
    setSets((rs as RewardSet[]) ?? []);
    setMatches((ms as Match[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const current = series.find((x) => x.id === selected) ?? null;
  const theme = themes.find((t) => t.id === current?.theme_id) ?? null;
  const sponsor = sponsors.find((x) => x.id === current?.sponsor_id) ?? null;
  const seriesMatches = matches.filter((m) => m.series_id === current?.id);

  // Step completeness, mirrored from the server checklist so locks match what Publish needs.
  const done1 = !!current && (current.no_sponsor || (!!sponsor && !!sponsor.logo_url && sponsor.is_active));
  const done2 = done1 && !!theme && (!theme.sponsor_name || !!theme.logo_url);
  const done3 = done2 && seriesMatches.length > 0;
  const unlocked = (s: Step) => s === 1 || (s === 2 && done1) || (s === 3 && done2) || (s === 4 && done3);

  function open(id: string | "new") {
    setSelected(id);
    setStep(1);
  }

  const visible = series.filter((x) => showArchived || !x.is_archived);

  return (
    <div className="flex flex-col gap-5">
      {/* Series picker */}
      <Panel
        title="Set up a series"
        intro="Work left to right: create the series, give it a theme, add its matches, then publish each match. A match can only be started in Live after it is published."
      >
        <div className="flex flex-wrap gap-2">
          {visible.map((x) => {
            const ms = matches.filter((m) => m.series_id === x.id);
            const pub = ms.filter((m) => m.published_at).length;
            return (
              <button
                key={x.id}
                onClick={() => open(x.id)}
                className={`min-w-48 rounded-lg border px-3 py-2 text-left ${selected === x.id ? "border-[#17201f] bg-[#17201f] text-white" : "border-[#d8dedb] hover:bg-[#f3f5f4]"} ${x.is_archived ? "opacity-60" : ""}`}
              >
                <span className="block font-semibold">{x.name}</span>
                <span className="block text-xs opacity-75">
                  {fmtDate(x.starts_on)} to {fmtDate(x.ends_on)} · {ms.length} match{ms.length === 1 ? "" : "es"}, {pub} published
                </span>
              </button>
            );
          })}
          <button onClick={() => open("new")} className={`rounded-lg border-2 border-dashed px-4 py-2 font-semibold ${selected === "new" ? "border-[#17201f]" : "border-[#b9c3bf]"}`}>
            + New series
          </button>
        </div>
        {series.some((x) => x.is_archived) && (
          <button className="mt-2 text-xs underline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived series" : "Show archived series"}
          </button>
        )}
      </Panel>

      {selected && (
        <>
          <Stepper step={step} setStep={setStep} unlocked={unlocked} done={[done1, done2, done3, seriesMatches.some((m) => m.published_at)]} />

          {step === 1 && (
            <SeriesStep
              key={current?.id ?? "new"}
              current={current}
              sponsors={sponsors}
              sets={sets}
              onSaved={async (id) => {
                await load();
                setSelected(id);
              }}
              onSponsorsChanged={load}
              onNext={() => setStep(2)}
              canNext={done1}
            />
          )}
          {step === 2 && current && (
            <ThemeStep current={current} themes={themes} onChanged={load} onNext={() => setStep(3)} canNext={done2} />
          )}
          {step === 3 && current && (
            <MatchesStep current={current} sets={sets} matches={matches} onChanged={load} onNext={() => setStep(4)} canNext={done3} />
          )}
          {step === 4 && current && <PublishStep current={current} matches={seriesMatches} onChanged={load} onFix={setStep} onOpenLive={onOpenLive} />}
        </>
      )}
    </div>
  );
}

// ====================================================================
function Stepper({ step, setStep, unlocked, done }: { step: Step; setStep: (s: Step) => void; unlocked: (s: Step) => boolean; done: boolean[] }) {
  const items: { n: Step; label: string; sub: string }[] = [
    { n: 1, label: "Series", sub: "Name, dates, title sponsor" },
    { n: 2, label: "Theme", sub: "Logos, banner, colours" },
    { n: 3, label: "Matches", sub: "Each match and its rewards" },
    { n: 4, label: "Publish", sub: "Final check, then go live" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Set-up steps">
      {items.map((it) => {
        const open = unlocked(it.n);
        const active = step === it.n;
        const complete = done[it.n - 1];
        return (
          <li key={it.n}>
            <button
              disabled={!open}
              onClick={() => setStep(it.n)}
              aria-current={active ? "step" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                active ? "border-[#17201f] bg-[#17201f] text-white" : open ? "border-[#d8dedb] bg-white hover:bg-[#f3f5f4]" : "cursor-not-allowed border-[#e6eae8] bg-[#f3f5f4] text-[#9aa5a2]"
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  complete ? "bg-emerald-600 text-white" : active ? "bg-white text-[#17201f]" : "bg-[#e6eae8] text-[#3b4745]"
                }`}
              >
                {complete ? "✓" : open ? it.n : "🔒"}
              </span>
              <span>
                <span className="block font-bold">{it.label}</span>
                <span className="block text-xs opacity-75">{open ? it.sub : "Finish the step before"}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ====================================================================
function SeriesStep({
  current,
  sponsors,
  sets,
  onSaved,
  onSponsorsChanged,
  onNext,
  canNext,
}: {
  current: Series | null;
  sponsors: Sponsor[];
  sets: RewardSet[];
  onSaved: (id: string) => void;
  onSponsorsChanged: () => Promise<void> | void;
  onNext: () => void;
  canNext: boolean;
}) {
  const [f, setF] = useState({
    name: current?.name ?? "",
    sport: current?.sport ?? "cricket",
    starts_on: current?.starts_on ?? "",
    ends_on: current?.ends_on ?? "",
    sponsor: current ? (current.no_sponsor ? "none" : current.sponsor_id ?? "") : "",
    reward_set_id: current?.reward_set_id ?? "",
  });
  const [newSp, setNewSp] = useState<{ name: string; logo_url: string | null; tagline: string; link_url: string } | null>(null);
  const s = useStatus();
  const chosen = sponsors.find((x) => x.id === f.sponsor);

  async function addSponsor() {
    if (!newSp) return;
    if (newSp.name.trim().length < 2) return s.fail("Give the sponsor a name.");
    if (!newSp.logo_url) return s.fail("Upload the sponsor's logo.");
    const { data, error } = await supabase()
      .from("sponsors")
      .insert({ name: newSp.name.trim(), logo_url: newSp.logo_url, tagline: newSp.tagline.trim() || null, link_url: newSp.link_url.trim() || null })
      .select()
      .single();
    if (error) return s.fail(error.message.includes("url") ? "The website must start with https://" : error);
    await onSponsorsChanged();
    setF((x) => ({ ...x, sponsor: (data as Sponsor).id }));
    setNewSp(null);
    s.ok("Sponsor added.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.sponsor) return s.fail("Choose the title sponsor, or pick \"No title sponsor\".");
    if (f.ends_on < f.starts_on) return s.fail("The end date is before the start date.");
    const row = {
      name: f.name.trim(),
      sport: f.sport,
      starts_on: f.starts_on,
      ends_on: f.ends_on,
      sponsor_id: f.sponsor === "none" ? null : f.sponsor,
      no_sponsor: f.sponsor === "none",
      reward_set_id: f.reward_set_id || null,
    };
    const sb = supabase();
    const { data, error } = current ? await sb.from("series").update(row).eq("id", current.id).select().single() : await sb.from("series").insert(row).select().single();
    if (error) return s.fail(error.message.includes("series_dates") ? "The end date is before the start date." : error);
    s.ok(current ? "Series saved." : "Series created. Next: its theme.");
    onSaved((data as Series).id);
  }

  async function archive() {
    if (!current) return;
    await supabase().from("series").update({ is_archived: !current.is_archived }).eq("id", current.id);
    onSaved(current.id);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Panel title="Step 1. Series details" intro="A series is a tournament or a set of matches that share one look and one title sponsor, for example a T20 league or a bilateral tour.">
        <form onSubmit={save} className="flex flex-col gap-3">
          <label>Series name<input required minLength={3} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Winter T20 League 2026" /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              Sport
              <select value={f.sport} onChange={(e) => setF({ ...f, sport: e.target.value })}>
                {SPORTS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>First match day<input required type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></label>
            <label>Last match day<input required type="date" min={f.starts_on || undefined} value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></label>
          </div>
          <label>
            Title sponsor (&quot;presented by&quot; on every match)
            <select required value={f.sponsor} onChange={(e) => setF({ ...f, sponsor: e.target.value })}>
              <option value="">Choose one</option>
              <option value="none">No title sponsor for this series</option>
              {sponsors.filter((x) => x.is_active || x.id === f.sponsor).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.logo_url ? "" : " (logo missing)"}
                </option>
              ))}
            </select>
          </label>
          {chosen && !chosen.logo_url && <p className="text-sm text-red-700">This sponsor has no logo yet. Add it under Sponsors, or add the sponsor again below with a logo.</p>}
          {!newSp ? (
            <button type="button" className="self-start text-sm font-semibold underline" onClick={() => setNewSp({ name: "", logo_url: null, tagline: "", link_url: "" })}>
              + Add a new sponsor here
            </button>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-[#d8dedb] bg-[#f8faf9] p-3">
              <p className="text-sm font-bold">New sponsor</p>
              <label>Brand name<input value={newSp.name} onChange={(e) => setNewSp({ ...newSp, name: e.target.value })} /></label>
              <ImageUpload kind="logo" label="Brand logo" required value={newSp.logo_url} onChange={(u) => setNewSp({ ...newSp, logo_url: u })} />
              <label>Tagline (optional)<input maxLength={90} value={newSp.tagline} onChange={(e) => setNewSp({ ...newSp, tagline: e.target.value })} /></label>
              <label>Website (https, optional)<input type="url" value={newSp.link_url} onChange={(e) => setNewSp({ ...newSp, link_url: e.target.value })} /></label>
              <span className="flex gap-2">
                <button type="button" className="btn btn-dark" onClick={addSponsor}>Save sponsor</button>
                <button type="button" className="btn btn-line" onClick={() => setNewSp(null)}>Cancel</button>
              </span>
              <p className="text-xs text-[#5b6865]">No alcohol brands as sponsors: surrogate alcohol advertising rules apply.</p>
            </div>
          )}
          <label>
            Default reward set for new matches (optional)
            <select value={f.reward_set_id} onChange={(e) => setF({ ...f, reward_set_id: e.target.value })}>
              <option value="">None</option>
              {sets.map((x) => <option key={x.id} value={x.id}>Set {x.code}: {x.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-dark">{current ? "Save series" : "Create series"}</button>
            {current && (
              <button type="button" className="btn btn-go" disabled={!canNext} onClick={onNext}>
                Next: Theme →
              </button>
            )}
            {current && (
              <button type="button" className="btn btn-line ml-auto" onClick={archive}>
                {current.is_archived ? "Restore series" : "Archive series"}
              </button>
            )}
          </div>
          {s.node}
        </form>
      </Panel>
      <Panel title="What happens next">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[#3b4745]">
          <li>Save the series. The Theme step unlocks.</li>
          <li>Pick or build the theme: sponsor logo, partner logos, banner and colours.</li>
          <li>Add each match in the series with its rewards.</li>
          <li>Publish each match when its checklist is all green. Only then can you start it in Live.</li>
        </ol>
      </Panel>
    </div>
  );
}

// ====================================================================
function ThemeStep({ current, themes, onChanged, onNext, canNext }: { current: Series; themes: Theme[]; onChanged: () => Promise<void> | void; onNext: () => void; canNext: boolean }) {
  const [mode, setMode] = useState<"pick" | "edit" | "new">(current.theme_id ? "pick" : themes.length ? "pick" : "new");
  const theme = themes.find((t) => t.id === current.theme_id) ?? null;
  const s = useStatus();

  async function attach(id: string | null) {
    const { error } = await supabase().from("series").update({ theme_id: id }).eq("id", current.id);
    if (error) return s.fail(error);
    await onChanged();
    s.ok(id ? "Theme attached to the series." : "Theme removed.");
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Step 2. Theme" intro="The theme is how every match in this series looks on players' phones: the sponsor's logo, partner logos, a banner and the colours.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64">
            Theme for {current.name}
            <select value={current.theme_id ?? ""} onChange={(e) => attach(e.target.value || null)}>
              <option value="">Choose a theme</option>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {theme && <button className="btn btn-line" onClick={() => setMode("edit")}>Edit this theme</button>}
          <button className="btn btn-line" onClick={() => setMode("new")}>+ Build a new theme</button>
          <button className="btn btn-go ml-auto" disabled={!canNext} onClick={onNext}>Next: Matches →</button>
        </div>
        {theme && theme.sponsor_name && !theme.logo_url && <p className="mt-2 text-sm text-red-700">This theme names a sponsor but has no logo. Edit it and upload the logo.</p>}
        {themes.some((t) => t.id === current.theme_id) && <p className="mt-2 text-xs text-[#5b6865]">Editing a theme changes it everywhere it is used.</p>}
        <div className="mt-2">{s.node}</div>
      </Panel>
      {mode === "pick" && theme && (
        <div className="max-w-sm">
          <ThemePreview t={theme} />
        </div>
      )}
      {mode === "edit" && theme && (
        <ThemeEditor key={theme.id} initial={theme} compact onSaved={async () => { await onChanged(); setMode("pick"); }} />
      )}
      {mode === "new" && (
        <ThemeEditor
          key="new"
          initial={null}
          compact
          onSaved={async (t) => {
            await attach(t.id);
            setMode("pick");
          }}
        />
      )}
    </div>
  );
}

// ====================================================================
type MatchForm = { title: string; starts_at: string; reward_mode: "set" | "per_question" | ""; reward_set_id: string };

function MatchesStep({ current, sets, matches, onChanged, onNext, canNext }: { current: Series; sets: RewardSet[]; matches: Match[]; onChanged: () => Promise<void> | void; onNext: () => void; canNext: boolean }) {
  const mine = matches.filter((m) => m.series_id === current.id);
  const loose = matches.filter((m) => !m.series_id && m.status !== "ended");
  const [editing, setEditing] = useState<string | null>(null);
  const s = useStatus();

  async function attachLoose(id: string) {
    const { error } = await supabase().from("matches").update({ series_id: current.id }).eq("id", id);
    if (error) return s.fail(error);
    await onChanged();
    s.ok("Match moved into this series.");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Panel title="Step 3. Add a match" intro={`Matches must fall between ${fmtDate(current.starts_on)} and ${fmtDate(current.ends_on)}.`}>
        <MatchEditor current={current} sets={sets} onSaved={onChanged} />
        {loose.length > 0 && (
          <div className="mt-5 border-t border-[#eef1ef] pt-4">
            <p className="text-sm font-bold">Matches not in any series</p>
            <ul className="mt-2 flex flex-col gap-2">
              {loose.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {m.title}
                    <span className="block text-xs text-[#5b6865]">{fmt(m.starts_at)}</span>
                  </span>
                  <button className="btn btn-line !py-1" onClick={() => attachLoose(m.id)}>Add to series</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-2">{s.node}</div>
      </Panel>
      <Panel title={`Matches in ${current.name}`}>
        <ul className="flex flex-col gap-2">
          {mine.map((m) => {
            const st = matchState(m);
            const locked = !!m.published_at;
            return (
              <li key={m.id} className="rounded-lg border border-[#eef1ef] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                  <span className="flex-1">
                    <span className="block font-semibold">{m.title}</span>
                    <span className="block text-xs text-[#5b6865]">
                      {fmt(m.starts_at)} ·{" "}
                      {m.reward_mode === "set" ? `Reward set ${sets.find((x) => x.id === m.reward_set_id)?.code ?? "?"}` : m.reward_mode === "per_question" ? "Per-question rewards" : "Rewards not chosen"}
                    </span>
                  </span>
                  {locked ? (
                    <span className="text-xs text-[#5b6865]">Unpublish in step 4 to edit</span>
                  ) : (
                    <button className="btn btn-line !py-1" onClick={() => setEditing(editing === m.id ? null : m.id)}>
                      {editing === m.id ? "Close" : "Edit"}
                    </button>
                  )}
                </div>
                {editing === m.id && !locked && (
                  <div className="mt-3 border-t border-[#eef1ef] pt-3">
                    <MatchEditor current={current} sets={sets} match={m} onSaved={async () => { await onChanged(); setEditing(null); }} />
                  </div>
                )}
              </li>
            );
          })}
          {mine.length === 0 && <li className="py-6 text-center text-[#5b6865]">No matches yet. Add the first one on the left.</li>}
        </ul>
        <div className="mt-4 flex">
          <button className="btn btn-go ml-auto" disabled={!canNext} onClick={onNext}>Next: Publish →</button>
        </div>
      </Panel>
    </div>
  );
}

function MatchEditor({ current, sets, match, onSaved }: { current: Series; sets: RewardSet[]; match?: Match; onSaved: () => Promise<void> | void }) {
  const blank: MatchForm = { title: "", starts_at: "", reward_mode: current.reward_set_id ? "set" : "", reward_set_id: current.reward_set_id ?? "" };
  const [f, setF] = useState<MatchForm>(
    match ? { title: match.title, starts_at: toLocal(match.starts_at), reward_mode: match.reward_mode ?? "", reward_set_id: match.reward_set_id ?? "" } : blank,
  );
  const s = useStatus();
  const min = `${current.starts_on}T00:00`;
  const max = `${current.ends_on}T23:59`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.reward_mode) return s.fail("Choose how this match gives rewards.");
    if (f.reward_mode === "set" && !f.reward_set_id) return s.fail("Pick the reward set.");
    if (f.starts_at < min || f.starts_at > max) return s.fail("The start time is outside the series dates.");
    const row = {
      title: f.title.trim(),
      sport: current.sport,
      starts_at: new Date(f.starts_at).toISOString(),
      series_id: current.id,
      reward_mode: f.reward_mode,
      reward_set_id: f.reward_mode === "set" ? f.reward_set_id : null,
    };
    const sb = supabase();
    const { error } = match ? await sb.from("matches").update(row).eq("id", match.id) : await sb.from("matches").insert(row);
    if (error) return s.fail(error);
    if (!match) setF(blank);
    s.ok(match ? "Match saved." : "Match added as a draft.");
    await onSaved();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label>Match title<input required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Mumbai vs Chennai, Match 4" /></label>
      <label>Starts at (India time)<input required type="datetime-local" min={min} max={max} value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></label>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-[#d8dedb] p-3">
        <legend className="px-1 text-sm font-bold">Rewards</legend>
        <label className="!flex-row items-center gap-2 !font-normal">
          <input type="radio" className="!w-auto" checked={f.reward_mode === "set"} onChange={() => setF({ ...f, reward_mode: "set" })} />
          A reward set: every right answer can win a coupon
        </label>
        {f.reward_mode === "set" && (
          <select value={f.reward_set_id} onChange={(e) => setF({ ...f, reward_set_id: e.target.value })}>
            <option value="">Pick a set</option>
            {sets.map((x) => <option key={x.id} value={x.id}>Set {x.code}: {x.name}</option>)}
          </select>
        )}
        {f.reward_mode === "set" && sets.length === 0 && <p className="text-xs text-red-700">No reward sets yet. Make one in the Rewards tab first.</p>}
        <label className="!flex-row items-center gap-2 !font-normal">
          <input type="radio" className="!w-auto" checked={f.reward_mode === "per_question"} onChange={() => setF({ ...f, reward_mode: "per_question" })} />
          Per-question rewards: I attach a reward to some questions in Live
        </label>
      </fieldset>
      <button className="btn btn-dark">{match ? "Save match" : "Add match"}</button>
      {s.node}
    </form>
  );
}

// ====================================================================
function PublishStep({ current, matches, onChanged, onFix, onOpenLive }: { current: Series; matches: Match[]; onChanged: () => Promise<void> | void; onFix: (s: Step) => void; onOpenLive: () => void }) {
  const [checks, setChecks] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const s = useStatus();
  const ids = useMemo(() => matches.map((m) => m.id + (m.published_at ?? "")).join(","), [matches]);

  const loadChecks = useCallback(async () => {
    const sb = supabase();
    const out: Record<string, string[]> = {};
    await Promise.all(
      matches.map(async (m) => {
        const { data } = await sb.rpc("match_checklist", { p_match: m.id });
        out[m.id] = (data as string[]) ?? [];
      }),
    );
    setChecks(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  useEffect(() => {
    loadChecks();
  }, [loadChecks]);

  async function publish(m: Match) {
    setBusy(m.id);
    const { error } = await supabase().rpc("publish_match", { p_match: m.id });
    setBusy(null);
    if (error) {
      await loadChecks();
      return s.fail(error.message.includes("not_ready") ? "Some items are still missing. Fix the red items below." : error);
    }
    s.ok(`${m.title} is published. Start it from the Live tab when the match begins.`);
    await onChanged();
  }
  async function unpublish(m: Match) {
    if (!confirm(`Unpublish ${m.title}? It goes back to draft and can't be started until you publish again.`)) return;
    const { error } = await supabase().rpc("unpublish_match", { p_match: m.id });
    if (error) return s.fail(error);
    s.ok("Back to draft. You can edit it in step 3.");
    await onChanged();
  }

  const order = Object.keys(CHECK_LABEL);
  return (
    <Panel title="Step 4. Check and publish" intro={`Every item must be green before a match in ${current.name} can be published. Published matches appear in the Live tab, ready to start.`}>
      <div className="mb-3">{s.node}</div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {matches.map((m) => {
          const missing = checks[m.id];
          const st = matchState(m);
          const ready = missing && missing.length === 0;
          return (
            <li key={m.id} className="rounded-xl border border-[#d8dedb] p-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                <span className="flex-1 font-semibold">{m.title}</span>
                <span className="text-xs text-[#5b6865]">{fmt(m.starts_at)}</span>
              </div>
              {!missing ? (
                <p className="mt-3 text-sm text-[#5b6865]">Checking...</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {order
                    .filter((k) => !["sponsor_paused", "reward_set", "series"].includes(k) || missing.includes(k))
                    .map((k) => {
                      const bad = missing.includes(k);
                      return (
                        <li key={k} className="flex items-center gap-2">
                          <span className={`flex size-5 items-center justify-center rounded-full text-xs font-bold ${bad ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>{bad ? "!" : "✓"}</span>
                          <span className={bad ? "font-semibold text-red-800" : ""}>{CHECK_LABEL[k].label}</span>
                          {bad && !m.published_at && (
                            <button className="ml-auto text-xs underline" onClick={() => onFix(CHECK_LABEL[k].step)}>
                              Fix in step {CHECK_LABEL[k].step}
                            </button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              )}
              <div className="mt-3 flex gap-2">
                {m.status === "ended" ? (
                  <span className="text-sm text-[#5b6865]">This match has ended.</span>
                ) : m.published_at ? (
                  <>
                    <button className="btn btn-go" onClick={onOpenLive}>Open in Live →</button>
                    {m.status !== "live" && <button className="btn btn-line" onClick={() => unpublish(m)}>Unpublish</button>}
                  </>
                ) : (
                  <button className="btn btn-dark" disabled={!ready || busy === m.id} onClick={() => publish(m)} title={ready ? "" : "Fix the red items first"}>
                    {busy === m.id ? "Publishing..." : ready ? "Publish match" : "🔒 Publish (fix red items)"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
