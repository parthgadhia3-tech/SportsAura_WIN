"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { APP_NAME } from "@/lib/copy";
import { StaffGate, type StaffMember } from "@/components/staff/StaffGate";
import { LiveConsole } from "@/components/staff/LiveConsole";
import {
  AnalyticsPanel,
  MatchesPanel,
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

const TABS = [
  { key: "live", label: "Live", admin: false },
  { key: "matches", label: "Matches", admin: false },
  { key: "packs", label: "Packs", admin: false },
  { key: "rewards", label: "Rewards", admin: false },
  { key: "sponsors", label: "Sponsors", admin: false },
  { key: "trivia", label: "Trivia rooms", admin: false },
  { key: "themes", label: "Themes", admin: false },
  { key: "offers", label: "Offers", admin: false },
  { key: "analytics", label: "Analytics", admin: false },
  { key: "venues", label: "Venues & billing", admin: true },
  { key: "staff", label: "Staff", admin: true },
  { key: "audit", label: "Audit", admin: true },
  { key: "settings", label: "Settings", admin: true },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function AdminPage() {
  return (
    <StaffGate roles={["admin", "game_master"]} title="Game Master">
      {(staff) => <Console staff={staff} />}
    </StaffGate>
  );
}

function Console({ staff }: { staff: StaffMember }) {
  const [tab, setTab] = useState<Tab>("live");
  const tabs = TABS.filter((t) => !t.admin || staff.role === "admin");

  return (
    <div className="staff min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-[#d8dedb] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <p className="font-bold">
            {APP_NAME} <span className="font-normal text-[#5b6865]">Game Master</span>
          </p>
          <nav className="flex flex-wrap gap-1" aria-label="Sections">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === t.key ? "bg-[#17201f] text-white" : "text-[#3b4745] hover:bg-[#eef1ef]"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button className="btn btn-line ml-auto !py-1" onClick={() => supabase().auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {tab === "live" && <LiveConsole />}
        {tab === "matches" && <MatchesPanel />}
        {tab === "packs" && <PacksPanel />}
        {tab === "rewards" && <RewardsPanel />}
        {tab === "sponsors" && <SponsorsPanel isAdmin={staff.role === "admin"} />}
        {tab === "trivia" && <TriviaPanel isAdmin={staff.role === "admin"} />}
        {tab === "themes" && <ThemesPanel />}
        {tab === "offers" && <OffersPanel />}
        {tab === "analytics" && <AnalyticsPanel />}
        {tab === "venues" && <VenuesPanel />}
        {tab === "staff" && <StaffPanel />}
        {tab === "audit" && <AuditPanel />}
        {tab === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
