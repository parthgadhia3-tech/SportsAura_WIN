"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/copy";
import { StaffGate, type StaffMember } from "@/components/staff/StaffGate";
import { LiveConsole } from "@/components/staff/LiveConsole";
import {
  EventConfig,
  EventCreate,
  PublishStep,
  SeriesConfig,
  SeriesCreate,
  ThemeStep,
  eventState,
  fmt,
  fmtDate,
  progress,
  useSetupData,
  type StepKey,
} from "@/components/staff/SetupFlow";
import {
  AnalyticsPanel,
  OffersPanel,
  PacksPanel,
  TriviaPanel,
  SponsorsPanel,
  AuditPanel,
  RewardsPanel,
  SettingsPanel,
  StaffPanel,
  ThemesPanel,
  VenuesPanel,
} from "@/components/staff/AdminPanels";

type CommonKey = "packs" | "rewards" | "sponsors" | "trivia" | "themes" | "offers" | "analytics";
type AdminKey = "venues" | "staff" | "audit" | "settings";
type Section = StepKey | CommonKey | AdminKey;

const STEPS: { key: StepKey; n: number; label: string; group: "series" | "event" }[] = [
  { key: "series-create", n: 1, label: "Series creation", group: "series" },
  { key: "series-config", n: 2, label: "Series configuration", group: "series" },
  { key: "series-theme", n: 3, label: "Theme management", group: "series" },
  { key: "event-create", n: 4, label: "Event creation", group: "event" },
  { key: "event-config", n: 5, label: "Event configuration", group: "event" },
  { key: "event-publish", n: 6, label: "Review & publish", group: "event" },
  { key: "event-live", n: 7, label: "Live control", group: "event" },
];
const COMMON: { key: CommonKey; label: string }[] = [
  { key: "packs", label: "Question packs" },
  { key: "rewards", label: "Rewards & reward sets" },
  { key: "sponsors", label: "Sponsors & report" },
  { key: "themes", label: "All themes" },
  { key: "offers", label: "Offer banners" },
  { key: "trivia", label: "Trivia rooms" },
  { key: "analytics", label: "Analytics" },
];
const ADMIN: { key: AdminKey; label: string }[] = [
  { key: "venues", label: "Venues & billing" },
  { key: "staff", label: "Staff" },
  { key: "audit", label: "Audit log" },
  { key: "settings", label: "Settings" },
];

export default function AdminPage() {
  return (
    <StaffGate roles={["admin", "game_master"]} title="Game Master">
      {(staff) => <Console staff={staff} />}
    </StaffGate>
  );
}

function ls(key: string, v?: string | null) {
  try {
    if (v === undefined) return localStorage.getItem(key);
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* private mode */
  }
  return null;
}

function Console({ staff }: { staff: StaffMember }) {
  const d = useSetupData();
  const isAdmin = staff.role === "admin";
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("series-create");
  const [open, setOpen] = useState({ series: true, event: true, common: false, admin: false });
  const restored = useRef(false);

  // Restore the last series / event once the data is in.
  useEffect(() => {
    if (!d.loaded || restored.current) return;
    restored.current = true;
    const s = ls("gm-series");
    if (s && d.series.some((x) => x.id === s)) {
      setSeriesId(s);
      const e = ls("gm-event");
      if (e && d.matches.some((m) => m.id === e && m.series_id === s)) setEventId(e);
    }
  }, [d.loaded, d.series, d.matches]);

  const p = progress(d, seriesId, eventId);
  const unlocked: Record<StepKey, boolean> = {
    "series-create": true,
    "series-config": p.done.seriesCreated,
    "series-theme": p.done.seriesConfigured,
    "event-create": p.done.themed,
    "event-config": p.done.eventCreated,
    "event-publish": p.done.eventCreated,
    "event-live": p.done.published,
  };
  const complete: Record<StepKey, boolean> = {
    "series-create": p.done.seriesCreated,
    "series-config": p.done.seriesConfigured,
    "series-theme": p.done.themed,
    "event-create": p.done.eventCreated,
    "event-config": p.done.eventConfigured,
    "event-publish": p.done.published,
    "event-live": p.ev?.status === "live" || p.ev?.status === "ended",
  };
  const lockReason: Record<StepKey, string> = {
    "series-create": "",
    "series-config": "Create or select a series first",
    "series-theme": "Finish series configuration first",
    "event-create": "Attach a theme first",
    "event-config": "Create or select an event first",
    "event-publish": "Create or select an event first",
    "event-live": "Publish the event first",
  };

  function selectSeries(id: string | null) {
    setSeriesId(id);
    ls("gm-series", id);
    setEventId(null);
    ls("gm-event", null);
  }
  function selectEvent(id: string | null) {
    setEventId(id);
    ls("gm-event", id);
  }

  const stepIdx = STEPS.findIndex((s) => s.key === section);
  const step = stepIdx >= 0 ? STEPS.at(stepIdx) : undefined;
  const nextStep = stepIdx >= 0 ? STEPS.at(stepIdx + 1) : undefined;
  const prevStep = stepIdx > 0 ? STEPS.at(stepIdx - 1) : undefined;

  // If the current step becomes locked (series changed), fall back to the furthest open step.
  const stepLocked = !!step && !unlocked[step.key];
  const furthest = [...STEPS].reverse().find((s) => unlocked[s.key])?.key ?? "series-create";
  useEffect(() => {
    if (d.loaded && stepLocked) setSection(furthest);
  }, [d.loaded, stepLocked, furthest]);

  return (
    <div className="staff flex min-h-dvh flex-col">
      {/* ------------------------------------------------ top bar */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-[#0C2427] via-[#123236] to-[#1F5257] text-white shadow">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="mr-2 font-bold">
            {APP_NAME} <span className="font-normal opacity-70">Game Master</span>
          </p>
          <Picker
            icon="🏆"
            caption="Selected series"
            value={p.s?.name}
            empty="No series selected"
            items={d.series.filter((x) => !x.is_archived).map((x) => ({ id: x.id, title: x.name, sub: `${fmtDate(x.starts_on)} to ${fmtDate(x.ends_on)}` }))}
            onPick={(id) => {
              selectSeries(id);
              setSection("series-config");
            }}
            onNew={() => {
              setSection("series-create");
            }}
            newLabel="+ Create a new series"
          />
          <Picker
            icon="🏏"
            caption="Selected event"
            value={p.ev ? `${p.ev.title}` : undefined}
            badge={p.ev ? eventState(p.ev) : undefined}
            empty={p.s ? "No event selected" : "Select a series first"}
            disabled={!p.done.themed}
            items={p.events.map((m) => ({ id: m.id, title: m.title, sub: `${fmt(m.starts_at)} · ${eventState(m).label}` }))}
            onPick={(id) => {
              selectEvent(id);
              setSection("event-config");
            }}
            onNew={() => setSection("event-create")}
            newLabel="+ Create a new event"
          />
          <button className="btn ml-auto border-white/30 bg-white/10 !py-1 text-white hover:bg-white/20" onClick={() => supabase().auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* ------------------------------------------------ sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-72 shrink-0 overflow-y-auto border-r border-[#d8dedb] bg-white py-3 md:block" aria-label="Game Master sections">
          <NavGroup title="Series management" open={open.series} onToggle={() => setOpen({ ...open, series: !open.series })}>
            {STEPS.filter((s) => s.group === "series").map((s) => (
              <StepItem key={s.key} n={s.n} label={s.label} active={section === s.key} locked={!unlocked[s.key]} done={complete[s.key]} reason={lockReason[s.key]} onClick={() => setSection(s.key)} />
            ))}
          </NavGroup>
          <NavGroup title="Event management" open={open.event} onToggle={() => setOpen({ ...open, event: !open.event })}>
            {STEPS.filter((s) => s.group === "event").map((s) => (
              <StepItem key={s.key} n={s.n} label={s.label} active={section === s.key} locked={!unlocked[s.key]} done={complete[s.key]} reason={lockReason[s.key]} onClick={() => setSection(s.key)} />
            ))}
          </NavGroup>
          <NavGroup title="Common functions" open={open.common} onToggle={() => setOpen({ ...open, common: !open.common })}>
            {COMMON.map((c) => (
              <PlainItem key={c.key} label={c.label} active={section === c.key} onClick={() => setSection(c.key)} />
            ))}
          </NavGroup>
          {isAdmin && (
            <NavGroup title="Admin" open={open.admin} onToggle={() => setOpen({ ...open, admin: !open.admin })}>
              {ADMIN.map((c) => (
                <PlainItem key={c.key} label={c.label} active={section === c.key} onClick={() => setSection(c.key)} />
              ))}
            </NavGroup>
          )}
        </aside>

        {/* ------------------------------------------------ main */}
        <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
          {/* phone: section picker */}
          <select className="mb-4 md:!hidden" value={section} onChange={(e) => setSection(e.target.value as Section)} aria-label="Section">
            {STEPS.map((s) => (
              <option key={s.key} value={s.key} disabled={!unlocked[s.key]}>
                {s.n}. {s.label}
                {complete[s.key] ? " ✓" : unlocked[s.key] ? "" : " (locked)"}
              </option>
            ))}
            {COMMON.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            {isAdmin && ADMIN.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>

          {step && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6865]">
                  Step {step.n} of {STEPS.length} · {step.group === "series" ? "Series management" : "Event management"}
                </p>
                <h1 className="text-2xl font-bold">{step.label}</h1>
              </div>
              <Progress steps={STEPS.map((s) => complete[s.key])} current={stepIdx} />
            </div>
          )}

          {!d.loaded ? (
            <p className="text-[#5b6865]">Loading...</p>
          ) : (
            <>
              {section === "series-create" && (
                <SeriesCreate
                  d={d}
                  selected={seriesId}
                  onCreated={(id) => {
                    selectSeries(id);
                    setSection("series-config");
                  }}
                  onSelect={(id) => {
                    selectSeries(id);
                    setSection("series-config");
                  }}
                />
              )}
              {section === "series-config" && p.s && <SeriesConfig d={d} current={p.s} onSaved={() => undefined} />}
              {section === "series-theme" && p.s && <ThemeStep d={d} current={p.s} />}
              {section === "event-create" && p.s && (
                <EventCreate
                  d={d}
                  current={p.s}
                  selected={eventId}
                  onCreated={(id) => {
                    selectEvent(id);
                    setSection("event-config");
                  }}
                  onSelect={(id) => {
                    selectEvent(id);
                    setSection("event-config");
                  }}
                />
              )}
              {section === "event-config" && p.s && p.ev && <EventConfig d={d} current={p.s} ev={p.ev} onGo={setSection} />}
              {section === "event-publish" && p.ev && <PublishStep d={d} ev={p.ev} onGo={setSection} />}
              {section === "event-live" && p.ev && (p.ev.status === "ended" ? <EndedNote /> : <LiveConsole key={p.ev.id} fixedMatchId={p.ev.id} />)}

              {section === "packs" && <PacksPanel />}
              {section === "rewards" && <RewardsPanel />}
              {section === "sponsors" && <SponsorsPanel isAdmin={isAdmin} />}
              {section === "themes" && <ThemesPanel />}
              {section === "offers" && <OffersPanel />}
              {section === "trivia" && <TriviaPanel isAdmin={isAdmin} />}
              {section === "analytics" && <AnalyticsPanel />}
              {isAdmin && section === "venues" && <VenuesPanel />}
              {isAdmin && section === "staff" && <StaffPanel />}
              {isAdmin && section === "audit" && <AuditPanel />}
              {isAdmin && section === "settings" && <SettingsPanel />}
            </>
          )}

          {step && (
            <div className="mt-6 flex items-center gap-3 border-t border-[#d8dedb] pt-4">
              {prevStep && (
                <button className="btn btn-line" onClick={() => setSection(prevStep.key)}>
                  ← {prevStep.label}
                </button>
              )}
              {nextStep && (
                <span className="ml-auto flex items-center gap-3">
                  {!unlocked[nextStep.key] && <span className="text-sm text-[#5b6865]">{lockReason[nextStep.key]}</span>}
                  <button className="btn btn-go" disabled={!unlocked[nextStep.key]} onClick={() => setSection(nextStep.key)}>
                    Next: {nextStep.label} →
                  </button>
                </span>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pieces
function Progress({ steps, current }: { steps: boolean[]; current: number }) {
  return (
    <ol className="ml-auto flex items-center gap-1" aria-label="Progress">
      {steps.map((done, i) => (
        <li key={i} className={`h-2 w-8 rounded-full ${done ? "bg-[#0f7a5c]" : i === current ? "bg-[#17201f]" : "bg-[#d8dedb]"}`} title={`Step ${i + 1}${done ? ", done" : ""}`} />
      ))}
    </ol>
  );
}

function NavGroup({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="mb-1">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-[#17201f]">
        {title}
        <span className={`transition ${open ? "" : "rotate-180"}`} aria-hidden>
          ⌃
        </span>
      </button>
      {open && <div className="flex flex-col">{children}</div>}
    </div>
  );
}

function StepItem({ n, label, active, locked, done, reason, onClick }: { n: number; label: string; active: boolean; locked: boolean; done: boolean; reason: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      title={locked ? reason : undefined}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 px-4 py-2 text-left text-sm ${active ? "bg-[#e3efe9] font-bold text-[#0b5a44]" : locked ? "cursor-not-allowed text-[#9aa5a2]" : "text-[#17201f] hover:bg-[#f3f5f4]"}`}
    >
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-[#0f7a5c] text-white" : active ? "bg-[#0b5a44] text-white" : locked ? "bg-[#eef1ef] text-[#9aa5a2]" : "border border-[#9aa5a2] text-[#3b4745]"
        }`}
      >
        {done ? "✓" : locked ? "🔒" : n}
      </span>
      <span className="flex-1">
        {label}
        {locked && <span className="block text-[11px] font-normal">{reason}</span>}
      </span>
    </button>
  );
}

function PlainItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined} className={`px-4 py-2 pl-[3.25rem] text-left text-sm ${active ? "bg-[#e3efe9] font-bold text-[#0b5a44]" : "text-[#17201f] hover:bg-[#f3f5f4]"}`}>
      {label}
    </button>
  );
}

function Picker({
  icon,
  caption,
  value,
  badge,
  empty,
  disabled,
  items,
  onPick,
  onNew,
  newLabel,
}: {
  icon: string;
  caption: string;
  value?: string;
  badge?: { label: string; cls: string };
  empty: string;
  disabled?: boolean;
  items: { id: string; title: string; sub: string }[];
  onPick: (id: string) => void;
  onNew: () => void;
  newLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!value && disabled) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/30 px-4 py-2 text-sm text-white/60">
        <span aria-hidden>ⓘ</span> {empty}
      </div>
    );
  }
  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center gap-3 rounded-xl border px-3 py-1.5 ${value ? "border-white/25 bg-white/10" : "border-dashed border-white/30"}`}>
        <span className="text-lg" aria-hidden>{icon}</span>
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/60">{caption}</span>
          <span className="flex items-center gap-2">
            <span className="block max-w-56 truncate font-bold">{value ?? <span className="font-normal text-white/70">{empty}</span>}</span>
            {badge && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>}
          </span>
        </span>
        <span className="mx-1 h-8 w-px bg-white/20" />
        <button className="btn bg-white !px-3 !py-1 text-[#17201f]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          ⟳ {value ? "Change" : "Select"}
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-[#d8dedb] bg-white text-[#17201f] shadow-xl">
          <ul className="max-h-80 overflow-y-auto">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  className="block w-full px-4 py-2 text-left hover:bg-[#f3f5f4]"
                  onClick={() => {
                    onPick(it.id);
                    setOpen(false);
                  }}
                >
                  <span className="block font-semibold">{it.title}</span>
                  <span className="block text-xs text-[#5b6865]">{it.sub}</span>
                </button>
              </li>
            ))}
            {items.length === 0 && <li className="px-4 py-3 text-sm text-[#5b6865]">Nothing here yet.</li>}
          </ul>
          <button
            className="block w-full border-t border-[#eef1ef] px-4 py-2 text-left text-sm font-bold text-[#0b5a44] hover:bg-[#f3f5f4]"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
          >
            {newLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function EndedNote() {
  return (
    <div className="rounded-xl border border-[#d8dedb] bg-white p-5">
      <p className="font-bold">This event has ended.</p>
      <p className="mt-1 text-sm text-[#5b6865]">Results and leaderboards are final. Select another event from the top bar.</p>
    </div>
  );
}
