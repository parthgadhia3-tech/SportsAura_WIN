"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import type { Match, Series, Sponsor, Theme } from "@/lib/types";
import { ThemeEditor, ThemePreview } from "./AdminPanels";
import { ImageUpload } from "./ImageUpload";

/**
 * The pieces of the Game Master flow. The admin page arranges them as numbered
 * steps in a sidebar: Series creation → Series configuration → Theme →
 * Event creation → Event configuration → Review & publish → Live.
 */

export type StepKey = "series-create" | "series-config" | "series-theme" | "event-create" | "event-config" | "event-publish" | "event-live";
const SPORTS = ["cricket", "football", "kabaddi", "f1", "tennis", "other"];

export const CHECK_LABEL: Record<string, { label: string; step: StepKey }> = {
  series: { label: "Event belongs to this series", step: "event-create" },
  sponsor: { label: "Title sponsor chosen, or marked as none", step: "series-config" },
  sponsor_logo: { label: "Title sponsor has a logo", step: "series-config" },
  sponsor_paused: { label: "Title sponsor is active, not paused", step: "series-config" },
  theme: { label: "Series has a theme", step: "series-theme" },
  theme_logo: { label: "Theme sponsor logo uploaded", step: "series-theme" },
  match_title: { label: "Event has a title", step: "event-config" },
  match_dates: { label: "Event date falls inside the series dates", step: "event-config" },
};

// ---------------------------------------------------------------- shared data
export type SetupData = {
  series: Series[];
  themes: Theme[];
  sponsors: Sponsor[];
  matches: Match[];
  loaded: boolean;
  reload: () => Promise<void>;
};

export function useSetupData(): SetupData {
  const [d, setD] = useState<Omit<SetupData, "reload">>({ series: [], themes: [], sponsors: [], matches: [], loaded: false });
  const reload = useCallback(async () => {
    const sb = supabase();
    const [{ data: se }, { data: th }, { data: sp }, { data: ms }] = await Promise.all([
      sb.from("series").select("*").order("starts_on", { ascending: false }),
      sb.from("themes").select("*").order("name"),
      sb.from("sponsors").select("*").order("name"),
      sb.from("matches").select("*").order("starts_at"),
    ]);
    setD({
      series: (se as Series[]) ?? [],
      themes: (th as Theme[]) ?? [],
      sponsors: (sp as Sponsor[]) ?? [],
      matches: (ms as Match[]) ?? [],
      loaded: true,
    });
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { ...d, reload };
}

/** Which steps are complete for the selected series and event. Mirrors the server checklist. */
export function progress(d: SetupData, seriesId: string | null, eventId: string | null) {
  const s = d.series.find((x) => x.id === seriesId) ?? null;
  const sponsor = d.sponsors.find((x) => x.id === s?.sponsor_id) ?? null;
  const theme = d.themes.find((t) => t.id === s?.theme_id) ?? null;
  const events = d.matches.filter((m) => s && m.series_id === s.id);
  const ev = events.find((m) => m.id === eventId) ?? null;
  const seriesCreated = !!s;
  const seriesConfigured = !!s && (s.no_sponsor || (!!sponsor && !!sponsor.logo_url && sponsor.is_active));
  const themed = seriesConfigured && !!theme && (!theme.sponsor_name || !!theme.logo_url);
  const eventCreated = themed && !!ev;
  const evStart = ev ? new Date(new Date(ev.starts_at).getTime() + 330 * 60000).toISOString().slice(0, 10) : "";
  const eventConfigured = eventCreated && !!ev && ev.title.trim().length >= 3 && !!s && evStart >= s.starts_on && evStart <= s.ends_on;
  const published = !!ev?.published_at;
  return { s, sponsor, theme, events, ev, done: { seriesCreated, seriesConfigured, themed, eventCreated, eventConfigured, published } };
}

// ---------------------------------------------------------------- bits
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

export function Panel({ title, intro, children, aside }: { title: string; intro?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#d8dedb] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside}
      </div>
      {intro && <p className="mb-4 mt-1 text-sm text-[#5b6865]">{intro}</p>}
      {!intro && <div className="h-3" />}
      {children}
    </section>
  );
}

const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
export const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
export const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { dateStyle: "medium" });

export function eventState(m: Match): { label: string; cls: string } {
  if (m.status === "live") return { label: "Live", cls: "bg-emerald-600 text-white" };
  if (m.status === "ended") return { label: "Ended", cls: "bg-[#d8dedb] text-[#3b4745]" };
  if (m.published_at) return { label: "Published", cls: "bg-[#17201f] text-white" };
  return { label: "Draft", cls: "bg-amber-100 text-amber-900" };
}

// ================================================================ 1. Series creation
export function SeriesCreate({ d, selected, onCreated, onSelect }: { d: SetupData; selected: string | null; onCreated: (id: string) => void; onSelect: (id: string) => void }) {
  const [showArchived, setShowArchived] = useState(false);
  const list = d.series.filter((x) => showArchived || !x.is_archived);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <SeriesForm d={d} current={null} onSaved={onCreated} title="Create a new series" />
      <Panel
        title="All series"
        intro="Pick a series to work on. Everything in the steps that follow belongs to the selected series."
        aside={
          d.series.some((x) => x.is_archived) ? (
            <button className="text-xs underline" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
          ) : null
        }
      >
        <table className="w-full text-sm">
          <thead className="text-left text-[#5b6865]">
            <tr><th className="py-1">Series</th><th>Dates</th><th>Events</th><th /></tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const ms = d.matches.filter((m) => m.series_id === x.id);
              return (
                <tr key={x.id} className={`border-t border-[#eef1ef] ${x.is_archived ? "opacity-60" : ""}`}>
                  <td className="py-2 font-semibold">{x.name}</td>
                  <td className="text-[#3b4745]">{fmtDate(x.starts_on)} to {fmtDate(x.ends_on)}</td>
                  <td>{ms.length} ({ms.filter((m) => m.published_at).length} published)</td>
                  <td className="text-right">
                    {selected === x.id ? (
                      <span className="text-xs font-bold text-[#0f7a5c]">Selected</span>
                    ) : (
                      <button className="btn btn-line !py-1" onClick={() => onSelect(x.id)}>Select</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-[#5b6865]">No series yet. Create the first one on the left.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ================================================================ 2. Series configuration
export function SeriesConfig({ d, current, onSaved }: { d: SetupData; current: Series; onSaved: (id: string) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <SeriesForm key={current.id} d={d} current={current} onSaved={onSaved} title="Series configuration" />
      <Panel title="Series at a glance">
        <SeriesSummary d={d} s={current} />
      </Panel>
    </div>
  );
}

function SeriesSummary({ d, s }: { d: SetupData; s: Series }) {
  const sponsor = d.sponsors.find((x) => x.id === s.sponsor_id);
  const row = (k: string, v: ReactNode) => (
    <div className="flex justify-between gap-3 border-t border-[#eef1ef] py-2 text-sm">
      <span className="text-[#5b6865]">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  );
  return (
    <div>
      {row("Sport", s.sport)}
      {row("Dates", `${fmtDate(s.starts_on)} to ${fmtDate(s.ends_on)}`)}
      {row(
        "Title sponsor",
        s.no_sponsor ? "None" : sponsor ? (
          <span className="inline-flex items-center gap-2">
            {sponsor.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sponsor.logo_url} alt="" className="h-6 w-auto max-w-16 object-contain" />
            )}
            {sponsor.name}
          </span>
        ) : (
          <span className="text-red-700">Not chosen</span>
        ),
      )}
      {row("Theme", d.themes.find((t) => t.id === s.theme_id)?.name ?? <span className="text-amber-700">Next step</span>)}
    </div>
  );
}

function SeriesForm({ d, current, onSaved, title }: { d: SetupData; current: Series | null; onSaved: (id: string) => void; title: string }) {
  const [f, setF] = useState({
    name: current?.name ?? "",
    sport: current?.sport ?? "cricket",
    starts_on: current?.starts_on ?? "",
    ends_on: current?.ends_on ?? "",
    sponsor: current ? (current.no_sponsor ? "none" : current.sponsor_id ?? "") : "",
  });
  const [newSp, setNewSp] = useState<{ name: string; logo_url: string | null; tagline: string; link_url: string } | null>(null);
  const s = useStatus();
  const chosen = d.sponsors.find((x) => x.id === f.sponsor);

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
    await d.reload();
    setF((x) => ({ ...x, sponsor: (data as Sponsor).id }));
    setNewSp(null);
    s.ok("Sponsor added.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.sponsor) return s.fail('Choose the title sponsor, or pick "No title sponsor".');
    if (f.ends_on < f.starts_on) return s.fail("The last day is before the first day.");
    const row = {
      name: f.name.trim(),
      sport: f.sport,
      starts_on: f.starts_on,
      ends_on: f.ends_on,
      sponsor_id: f.sponsor === "none" ? null : f.sponsor,
      no_sponsor: f.sponsor === "none",
    };
    const sb = supabase();
    const { data, error } = current ? await sb.from("series").update(row).eq("id", current.id).select().single() : await sb.from("series").insert(row).select().single();
    if (error) return s.fail(error.message.includes("series_dates") ? "The last day is before the first day." : error);
    await d.reload();
    s.ok(current ? "Series saved." : "Series created and selected.");
    if (!current) setF({ name: "", sport: "cricket", starts_on: "", ends_on: "", sponsor: "" });
    onSaved((data as Series).id);
  }

  async function archive() {
    if (!current) return;
    await supabase().from("series").update({ is_archived: !current.is_archived }).eq("id", current.id);
    await d.reload();
  }

  return (
    <Panel title={title} intro={current ? undefined : "A series is a tournament or tour whose matches share one look and one title sponsor, for example \"WI tour of India, 2026\"."}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <label>Series name<input required minLength={3} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. WI tour of India, 2026" /></label>
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
          Title sponsor (&quot;presented by&quot; on every event)
          <select required value={f.sponsor} onChange={(e) => setF({ ...f, sponsor: e.target.value })}>
            <option value="">Choose one</option>
            <option value="none">No title sponsor for this series</option>
            {d.sponsors.filter((x) => x.is_active || x.id === f.sponsor).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.logo_url ? "" : " (logo missing)"}
              </option>
            ))}
          </select>
        </label>
        {chosen && !chosen.logo_url && <p className="text-sm text-red-700">This sponsor has no logo yet. Add it in Common functions › Sponsors.</p>}
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
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-dark">{current ? "Save configuration" : "Create series"}</button>
          {current && (
            <button type="button" className="btn btn-line ml-auto" onClick={archive}>
              {current.is_archived ? "Restore series" : "Archive series"}
            </button>
          )}
        </div>
        {s.node}
      </form>
    </Panel>
  );
}

// ================================================================ 3. Theme
export function ThemeStep({ d, current }: { d: SetupData; current: Series }) {
  const [mode, setMode] = useState<"pick" | "edit" | "new">(current.theme_id ? "pick" : d.themes.length ? "pick" : "new");
  const theme = d.themes.find((t) => t.id === current.theme_id) ?? null;
  const s = useStatus();

  async function attach(id: string | null) {
    const { error } = await supabase().from("series").update({ theme_id: id }).eq("id", current.id);
    if (error) return s.fail(error);
    await d.reload();
    s.ok(id ? "Theme attached to the series." : "Theme removed.");
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Theme management" intro="How every event in this series looks on players' phones: the title sponsor logo, partner logos, a banner and the colours.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-64">
            Theme for {current.name}
            <select value={current.theme_id ?? ""} onChange={(e) => attach(e.target.value || null)}>
              <option value="">Choose a theme</option>
              {d.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {theme && <button className="btn btn-line" onClick={() => setMode("edit")}>Edit this theme</button>}
          <button className="btn btn-line" onClick={() => setMode("new")}>+ Build a new theme</button>
        </div>
        {theme && theme.sponsor_name && !theme.logo_url && <p className="mt-2 text-sm text-red-700">This theme names a sponsor but has no logo. Edit it and upload the logo.</p>}
        {theme && <p className="mt-2 text-xs text-[#5b6865]">Editing a theme changes it everywhere it is used.</p>}
        <div className="mt-2">{s.node}</div>
      </Panel>
      {mode === "pick" && theme && (
        <div className="max-w-sm">
          <ThemePreview t={theme} />
        </div>
      )}
      {mode === "edit" && theme && (
        <ThemeEditor key={theme.id} initial={theme} compact onSaved={async () => { await d.reload(); setMode("pick"); }} />
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

// ================================================================ 4. Event creation
export function EventCreate({ d, current, selected, onCreated, onSelect }: { d: SetupData; current: Series; selected: string | null; onCreated: (id: string) => void; onSelect: (id: string) => void }) {
  const events = d.matches.filter((m) => m.series_id === current.id);
  const loose = d.matches.filter((m) => !m.series_id && m.status !== "ended");
  const s = useStatus();

  async function attachLoose(id: string) {
    const { error } = await supabase().from("matches").update({ series_id: current.id }).eq("id", id);
    if (error) return s.fail(error);
    await d.reload();
    onSelect(id);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
      <Panel title="Create an event" intro={`An event is one match in ${current.name}. It must fall between ${fmtDate(current.starts_on)} and ${fmtDate(current.ends_on)}.`}>
        <EventForm d={d} current={current} onSaved={onCreated} />
        {loose.length > 0 && (
          <div className="mt-5 border-t border-[#eef1ef] pt-4">
            <p className="text-sm font-bold">Older matches not in any series</p>
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
      <Panel title={`Events in ${current.name}`} intro="Select an event to configure, publish and run it.">
        <ul className="flex flex-col gap-2">
          {events.map((m) => {
            const st = eventState(m);
            const isSel = selected === m.id;
            return (
              <li key={m.id} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${isSel ? "border-[#17201f] bg-[#f3f5f4]" : "border-[#eef1ef]"}`}>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{m.title}</span>
                  <span className="block text-xs text-[#5b6865]">{fmt(m.starts_at)}</span>
                </span>
                {isSel ? <span className="text-xs font-bold text-[#0f7a5c]">Selected</span> : <button className="btn btn-line !py-1" onClick={() => onSelect(m.id)}>Select</button>}
              </li>
            );
          })}
          {events.length === 0 && <li className="py-8 text-center text-[#5b6865]">No events yet. Create the first one on the left.</li>}
        </ul>
      </Panel>
    </div>
  );
}

function EventForm({ d, current, match, onSaved }: { d: SetupData; current: Series; match?: Match; onSaved: (id: string) => void }) {
  type F = { title: string; starts_at: string };
  const blank: F = { title: "", starts_at: "" };
  const [f, setF] = useState<F>(match ? { title: match.title, starts_at: toLocal(match.starts_at) } : blank);
  const s = useStatus();
  const min = `${current.starts_on}T00:00`;
  const max = `${current.ends_on}T23:59`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.starts_at < min || f.starts_at > max) return s.fail("The start time is outside the series dates.");
    const row = {
      title: f.title.trim(),
      sport: current.sport,
      starts_at: new Date(f.starts_at).toISOString(),
      series_id: current.id,
    };
    const sb = supabase();
    const { data, error } = match ? await sb.from("matches").update(row).eq("id", match.id).select().single() : await sb.from("matches").insert(row).select().single();
    if (error) return s.fail(error);
    if (!match) setF(blank);
    await d.reload();
    s.ok(match ? "Event saved." : "Event created as a draft and selected.");
    onSaved((data as Match).id);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label>Event title<input required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. IND vs WI, 1st T20I" /></label>
      <label>Starts at (India time)<input required type="datetime-local" min={min} max={max} value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></label>
      <p className="text-xs text-[#5b6865]">Every right answer in this event is worth 10 points.</p>
      <button className="btn btn-dark">{match ? "Save configuration" : "Create event"}</button>
      {s.node}
    </form>
  );
}

// ================================================================ 5. Event configuration
export function EventConfig({ d, current, ev, onGo }: { d: SetupData; current: Series; ev: Match; onGo: (k: StepKey) => void }) {
  const st = eventState(ev);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Panel title="Event configuration" aside={<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>}>
        {ev.published_at ? (
          <div className="rounded-lg bg-[#f3f5f4] p-4 text-sm">
            <p className="font-semibold">This event is published, so its configuration is locked.</p>
            <p className="mt-1 text-[#5b6865]">To change it, unpublish it in Review &amp; publish. You can&apos;t unpublish while it is live.</p>
            <button className="btn btn-line mt-3" onClick={() => onGo("event-publish")}>Go to Review &amp; publish</button>
          </div>
        ) : (
          <EventForm key={ev.id} d={d} current={current} match={ev} onSaved={() => undefined} />
        )}
      </Panel>
      <Panel title="Comes from the series">
        <SeriesSummary d={d} s={current} />
        <p className="mt-3 text-xs text-[#5b6865]">The theme and title sponsor are copied onto the event when you publish it.</p>
      </Panel>
    </div>
  );
}

// ================================================================ 6. Review & publish
export function PublishStep({ d, ev, onGo }: { d: SetupData; ev: Match; onGo: (k: StepKey) => void }) {
  const [missing, setMissing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const s = useStatus();

  const check = useCallback(async () => {
    const { data, error } = await supabase().rpc("match_checklist", { p_match: ev.id });
    if (error) return s.fail(error);
    setMissing((data as string[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id, ev.published_at, d.series, d.themes, d.sponsors]);
  useEffect(() => {
    check();
  }, [check]);

  async function publish() {
    setBusy(true);
    const { error } = await supabase().rpc("publish_match", { p_match: ev.id });
    setBusy(false);
    if (error) {
      await check();
      return s.fail(error.message.includes("not_ready") ? "Some items are still missing. Fix the red items." : error);
    }
    await d.reload();
    s.ok("Published. Live control is unlocked.");
  }
  async function unpublish() {
    if (!confirm(`Unpublish ${ev.title}? It goes back to draft and can't be started until you publish again.`)) return;
    const { error } = await supabase().rpc("unpublish_match", { p_match: ev.id });
    if (error) return s.fail(error);
    await d.reload();
    s.ok("Back to draft. Event configuration is editable again.");
  }

  const st = eventState(ev);
  const ready = missing?.length === 0;
  const ser = d.series.find((x) => x.id === ev.series_id);
  const th = d.themes.find((t) => t.id === (ev.theme_id ?? ser?.theme_id));
  const hidden = ["sponsor_paused", "series", ...(ser?.no_sponsor ? ["sponsor_logo"] : []), ...(th && !th.sponsor_name ? ["theme_logo"] : [])];
  const keys = Object.keys(CHECK_LABEL).filter((k) => !hidden.includes(k) || missing?.includes(k));
  return (
    <Panel title="Review & publish" intro="Every item must be green before the event can be published. Once published, it can be started from Live control." aside={<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>}>
      <p className="mb-3 font-semibold">
        {ev.title} <span className="font-normal text-[#5b6865]">· {fmt(ev.starts_at)}</span>
      </p>
      {!missing ? (
        <p className="text-sm text-[#5b6865]">Checking...</p>
      ) : (
        <ul className="flex max-w-xl flex-col divide-y divide-[#eef1ef] rounded-lg border border-[#eef1ef] text-sm">
          {keys.map((k) => {
            const bad = missing.includes(k);
            return (
              <li key={k} className="flex items-center gap-3 px-3 py-2">
                <span className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${bad ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>{bad ? "!" : "✓"}</span>
                <span className={bad ? "font-semibold text-red-800" : ""}>{CHECK_LABEL[k].label}</span>
                {bad && !ev.published_at && (
                  <button className="ml-auto text-xs font-semibold underline" onClick={() => onGo(CHECK_LABEL[k].step)}>
                    Fix this
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {ev.status === "ended" ? (
          <span className="text-sm text-[#5b6865]">This event has ended.</span>
        ) : ev.published_at ? (
          <>
            <button className="btn btn-go" onClick={() => onGo("event-live")}>Go to Live control →</button>
            {ev.status !== "live" && <button className="btn btn-line" onClick={unpublish}>Unpublish</button>}
          </>
        ) : (
          <button className="btn btn-dark" disabled={!ready || busy} onClick={publish}>
            {busy ? "Publishing..." : ready ? "Publish event" : "🔒 Publish (fix the red items first)"}
          </button>
        )}
      </div>
      <div className="mt-3">{s.node}</div>
    </Panel>
  );
}
