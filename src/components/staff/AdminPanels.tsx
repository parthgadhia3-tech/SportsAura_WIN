"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import { DEFAULT_THEME, themeVars } from "@/lib/theme";
import type { Banner, BillingStatus, Bucket, BgType, CodeMode, Match, QuestionTemplate, RewardRule, RewardSet, Season, Sponsor, Theme, Venue, VenueAccount, VenuePlan } from "@/lib/types";

// ---------------------------------------------------------------- helpers
function useStatus() {
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const ok = (text: string) => {
    setMsg({ text, bad: false });
    setTimeout(() => setMsg(null), 2500);
  };
  const fail = (e: unknown) => setMsg({ text: friendlyError(e), bad: true });
  const node = msg ? (
    <p className={`rounded-lg px-4 py-2 text-sm font-medium ${msg.bad ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-900"}`} role="status">
      {msg.text}
    </p>
  ) : null;
  return { ok, fail, node };
}

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#d8dedb] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

// ---------------------------------------------------------------- matches
export function MatchesPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("cricket");
  const [startsAt, setStartsAt] = useState("");
  const [themeId, setThemeId] = useState("");
  const [setId, setSetId] = useState("");
  const [sets, setSets] = useState<RewardSet[]>([]);
  const s = useStatus();

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: m }, { data: t }, { data: rs }] = await Promise.all([
      sb.from("matches").select("*").order("starts_at", { ascending: false }).limit(50),
      sb.from("themes").select("*").order("name"),
      sb.from("reward_sets").select("*").eq("is_active", true).order("code"),
    ]);
    setMatches((m as Match[]) ?? []);
    setThemes((t as Theme[]) ?? []);
    setSets((rs as RewardSet[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("matches").insert({
      title: title.trim(),
      sport,
      starts_at: fromLocal(startsAt) ?? new Date().toISOString(),
      theme_id: themeId || null,
      reward_set_id: setId || null,
    });
    if (error) return s.fail(error);
    setTitle("");
    s.ok("Match created.");
    load();
  }

  async function update(id: string, patch: Partial<Match>) {
    const { error } = await supabase().from("matches").update(patch).eq("id", id);
    if (error) return s.fail(error);
    s.ok("Saved.");
    load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card title="New match">
        <form onSubmit={create} className="flex flex-col gap-3">
          <label>Title<input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="MI vs CSK" /></label>
          <label>
            Sport
            <select value={sport} onChange={(e) => setSport(e.target.value)}>
              {["cricket", "football", "f1", "kabaddi", "tennis", "other"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>Starts at<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
          <label>
            Theme (sponsor look for this match)
            <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              <option value="">Use each venue&apos;s default</option>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>
            Reward set (every right answer wins a coupon)
            <select value={setId} onChange={(e) => setSetId(e.target.value)}>
              <option value="">None, only per-question rewards</option>
              {sets.map((x) => <option key={x.id} value={x.id}>Set {x.code}: {x.name}</option>)}
            </select>
          </label>
          <button className="btn btn-dark">Create match</button>
        </form>
      </Card>
      <div className="flex flex-col gap-3">
        {s.node}
        <Card title="Matches">
          <table className="w-full text-sm">
            <thead className="text-left text-[#5b6865]">
              <tr><th className="py-1">Match</th><th>Starts</th><th>Theme</th><th>Reward set</th><th>Status</th></tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id} className="border-t border-[#eef1ef]">
                  <td className="py-2 font-semibold">{m.title}</td>
                  <td>{new Date(m.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>
                    <select value={m.theme_id ?? ""} onChange={(e) => update(m.id, { theme_id: e.target.value || null })} className="!w-40 !py-1">
                      <option value="">Venue default</option>
                      {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={m.reward_set_id ?? ""} onChange={(e) => update(m.id, { reward_set_id: e.target.value || null })} className="!w-36 !py-1">
                      <option value="">None</option>
                      {sets.map((x) => <option key={x.id} value={x.id}>Set {x.code}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={m.status} onChange={(e) => update(m.id, { status: e.target.value as Match["status"] })} className="!w-32 !py-1">
                      <option value="scheduled">Scheduled</option>
                      <option value="live">Live</option>
                      <option value="ended">Ended</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rewards
type BucketForm = {
  id?: string;
  brand_name: string;
  logo_url: string;
  title: string;
  description: string;
  terms: string;
  kind: "none" | "beer" | "spirits";
  code_mode: CodeMode;
  static_code: string;
  affiliate_url: string;
  total_quantity: string;
  valid_until: string;
  is_active: boolean;
  set_id: string;
  rule: RewardRule;
  rule_n: string;
};
const EMPTY_BUCKET: BucketForm = {
  brand_name: "", logo_url: "", title: "", description: "", terms: "", kind: "none",
  code_mode: "unique", static_code: "", affiliate_url: "", total_quantity: "", valid_until: "", is_active: true,
  set_id: "", rule: "random", rule_n: "10",
};

const RULE_LABEL: Record<RewardRule, string> = {
  random: "Random",
  first_correct: "First right answer",
  every_n_correct: "Every N right answers",
};
const ruleText = (b: Pick<Bucket, "rule" | "rule_n">) =>
  b.rule === "every_n_correct" ? `Every ${b.rule_n} right answers` : RULE_LABEL[b.rule ?? "random"];

export function RewardsPanel() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [sets, setSets] = useState<RewardSet[]>([]);
  const [form, setForm] = useState<BucketForm>(EMPTY_BUCKET);
  const [newSet, setNewSet] = useState({ code: "", name: "" });
  const [filter, setFilter] = useState<string>("all");
  const s = useStatus();
  const set = <K extends keyof BucketForm>(k: K, v: BucketForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: b }, { data: rs }] = await Promise.all([
      sb.from("coupon_buckets").select("*").order("created_at", { ascending: false }),
      sb.from("reward_sets").select("*").order("code"),
    ]);
    setBuckets((b as Bucket[]) ?? []);
    setSets((rs as RewardSet[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const setById = Object.fromEntries(sets.map((x) => [x.id, x]));
  const label = (b: Bucket) => (b.set_id && setById[b.set_id] ? `${setById[b.set_id].code}${b.set_position ?? ""}` : "");
  const nextLabel = form.set_id && setById[form.set_id]
    ? `${setById[form.set_id].code}${Math.max(0, ...buckets.filter((b) => b.set_id === form.set_id).map((b) => b.set_position ?? 0)) + 1}`
    : "";

  async function createSet(e: React.FormEvent) {
    e.preventDefault();
    const code = newSet.code.trim().toUpperCase();
    const { data, error } = await supabase()
      .from("reward_sets")
      .insert({ code, name: newSet.name.trim() || `Set ${code}` })
      .select("*")
      .single();
    if (error) return s.fail(error.message.includes("code") ? "Set code must be unique: 1 to 6 capital letters or numbers, starting with a letter (e.g. Z)." : error);
    setNewSet({ code: "", name: "" });
    s.ok(`Set ${code} created. Add its coupons below.`);
    await load();
    setForm({ ...EMPTY_BUCKET, set_id: (data as RewardSet).id });
    setFilter((data as RewardSet).id);
  }

  async function toggleSet(x: RewardSet) {
    const { error } = await supabase().from("reward_sets").update({ is_active: !x.is_active }).eq("id", x.id);
    if (error) return s.fail(error);
    load();
  }

  async function edit(b: Bucket) {
    const { data: sec } = await supabase().from("coupon_bucket_secrets").select("*").eq("bucket_id", b.id).maybeSingle();
    setForm({
      id: b.id,
      brand_name: b.brand_name,
      logo_url: b.logo_url ?? "",
      title: b.title,
      description: b.description ?? "",
      terms: b.terms ?? "",
      kind: b.min_age === 25 ? "spirits" : b.is_alcohol ? "beer" : "none",
      code_mode: b.code_mode,
      static_code: sec?.static_code ?? "",
      affiliate_url: sec?.affiliate_url ?? "",
      total_quantity: b.total_quantity?.toString() ?? "",
      valid_until: toLocal(b.valid_until),
      is_active: b.is_active,
      set_id: b.set_id ?? "",
      rule: b.rule ?? "random",
      rule_n: b.rule_n?.toString() ?? "10",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(addAnother: boolean) {
    if (!form.brand_name.trim() || !form.title.trim()) return s.fail("Add a brand name and a reward title.");
    if (form.code_mode === "static" && !form.static_code.trim()) return s.fail("Add the promo code, or pick another code type.");
    if (form.set_id && form.rule === "every_n_correct" && !(Number(form.rule_n) >= 2)) return s.fail("Every N right answers needs N of 2 or more.");
    const row = {
      brand_name: form.brand_name.trim(),
      logo_url: form.logo_url.trim() || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      terms: form.terms.trim() || null,
      is_alcohol: form.kind !== "none",
      min_age: form.kind === "spirits" ? 25 : 21,
      code_mode: form.code_mode,
      total_quantity: form.total_quantity ? Number(form.total_quantity) : null,
      valid_until: fromLocal(form.valid_until),
      is_active: form.is_active,
      set_id: form.set_id || null,
      rule: form.set_id ? form.rule : "random",
      rule_n: form.set_id && form.rule === "every_n_correct" ? Number(form.rule_n) : null,
    };
    const sb = supabase();
    let id = form.id;
    if (id) {
      const { error } = await sb.from("coupon_buckets").update(row).eq("id", id);
      if (error) return s.fail(error);
    } else {
      const { data, error } = await sb.from("coupon_buckets").insert(row).select("id").single();
      if (error) return s.fail(error);
      id = data.id;
    }
    const { error: secErr } = await sb.from("coupon_bucket_secrets").upsert({
      bucket_id: id,
      affiliate_url: form.affiliate_url.trim() || null,
      static_code: form.code_mode === "static" ? form.static_code.trim() : null,
    });
    if (secErr) return s.fail(secErr);
    // "Save and add another" keeps brand, set and settings so a set of 20 is quick to fill.
    setForm(addAnother ? { ...form, id: undefined, title: "", description: "", static_code: "", rule: "random" } : { ...EMPTY_BUCKET, set_id: form.set_id });
    s.ok(addAnother ? "Saved. Fill in the next coupon." : "Saved.");
    load();
  }

  const shown = buckets
    .filter((b) => filter === "all" || (filter === "none" ? !b.set_id : b.set_id === filter))
    .sort((a, z) => (label(a) && label(z) ? (a.set_id === z.set_id ? (a.set_position ?? 0) - (z.set_position ?? 0) : label(a).localeCompare(label(z))) : label(a) ? -1 : label(z) ? 1 : 0));

  return (
    <div className="flex flex-col gap-6">
      {s.node}
      <Card title="Reward sets">
        <p className="mb-3 text-sm text-[#5b6865]">
          A set is a numbered list of coupons (Z1, Z2, ...). Attach it to a match in the Matches tab and every right answer
          wins one coupon automatically: event coupons when their rule fires, otherwise a random one.
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <form onSubmit={createSet} className="flex items-end gap-2">
            <label className="!w-24">Code<input required maxLength={6} value={newSet.code} onChange={(e) => setNewSet({ ...newSet, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="Z" /></label>
            <label className="!w-56">Name<input value={newSet.name} onChange={(e) => setNewSet({ ...newSet, name: e.target.value })} placeholder="IPL weekend offers" /></label>
            <button className="btn btn-dark">Create set</button>
          </form>
          <div className="flex flex-wrap gap-2">
            {sets.map((x) => {
              const items = buckets.filter((b) => b.set_id === x.id);
              const issued = items.reduce((n, b) => n + b.issued_count, 0);
              const events = items.filter((b) => b.rule !== "random").length;
              return (
                <div key={x.id} className={`rounded-lg border px-3 py-2 text-sm ${x.is_active ? "border-[#0f7a5c] bg-emerald-50" : "border-[#d8dedb] bg-white opacity-60"}`}>
                  <p className="font-bold">Set {x.code} <span className="font-normal text-[#5b6865]">{x.name}</span></p>
                  <p className="text-[#3b4745]">{items.length} coupons, {events} event, {issued} given out</p>
                  <div className="mt-1 flex gap-2">
                    <button className="text-xs font-semibold underline" onClick={() => { setFilter(x.id); setForm({ ...EMPTY_BUCKET, set_id: x.id }); }}>Add coupons</button>
                    <button className="text-xs font-semibold underline" onClick={() => toggleSet(x)}>{x.is_active ? "Pause" : "Activate"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card
          title={form.id ? `Edit coupon ${form.set_id ? "" : "bucket"}` : nextLabel ? `New coupon ${nextLabel}` : "New reward bucket"}
          aside={form.id && <button className="btn btn-line" onClick={() => setForm({ ...EMPTY_BUCKET, set_id: form.set_id })}>New instead</button>}
        >
          <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="flex flex-col gap-3">
            <label>
              Reward set
              <select value={form.set_id} onChange={(e) => set("set_id", e.target.value)}>
                <option value="">None (single bonus reward for questions)</option>
                {sets.map((x) => <option key={x.id} value={x.id}>Set {x.code}: {x.name}</option>)}
              </select>
            </label>
            {form.set_id && (
              <div className="rounded-lg bg-[#f1f5f3] p-3">
                <label>
                  Give out when
                  <select value={form.rule} onChange={(e) => set("rule", e.target.value as RewardRule)}>
                    <option value="random">Random (any right answer)</option>
                    <option value="first_correct">Player&apos;s first right answer of the match</option>
                    <option value="every_n_correct">Every N right answers (per player, per match)</option>
                  </select>
                </label>
                {form.rule === "every_n_correct" && (
                  <label className="mt-2">N<input type="number" min={2} max={500} value={form.rule_n} onChange={(e) => set("rule_n", e.target.value)} /></label>
                )}
              </div>
            )}
            <label>Brand name<input required value={form.brand_name} onChange={(e) => set("brand_name", e.target.value)} /></label>
            <label>Logo URL (https)<input type="url" pattern="https://.*" value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} /></label>
            <label>Reward title<input required value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="20% off your food bill" /></label>
            <label>Description<input value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
            <label>Terms<textarea rows={2} value={form.terms} onChange={(e) => set("terms", e.target.value)} /></label>
            <label>
              Contains alcohol?
              <select value={form.kind} onChange={(e) => set("kind", e.target.value as BucketForm["kind"])}>
                <option value="none">No alcohol</option>
                <option value="beer">Beer or wine (21+)</option>
                <option value="spirits">Spirits (25+ only)</option>
              </select>
            </label>
            <label>
              Code type
              <select value={form.code_mode} onChange={(e) => set("code_mode", e.target.value as CodeMode)}>
                <option value="unique">Unique code per winner (venue redeems it)</option>
                <option value="static">Same promo code for everyone (brand code)</option>
                <option value="none">No code (link only)</option>
              </select>
            </label>
            {form.code_mode === "static" && (
              <label>Promo code<input value={form.static_code} onChange={(e) => set("static_code", e.target.value)} /></label>
            )}
            <label>
              Affiliate or brand link (https)
              <input type="url" pattern="https://.*" value={form.affiliate_url} onChange={(e) => set("affiliate_url", e.target.value)} placeholder="Leave empty for in-venue rewards" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>Quantity<input type="number" min={1} value={form.total_quantity} onChange={(e) => set("total_quantity", e.target.value)} placeholder="Unlimited" /></label>
              <label>Valid until<input type="datetime-local" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} /></label>
            </div>
            <label className="!flex items-center gap-2">
              <input type="checkbox" className="!w-auto" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              Active
            </label>
            <div className="flex gap-2">
              <button className="btn btn-dark flex-1">Save</button>
              {!form.id && (
                <button type="button" className="btn btn-line flex-1" onClick={() => save(true)}>
                  Save and add another
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card
          title="Coupons"
          aside={
            <select className="!w-48" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All coupons</option>
              {sets.map((x) => <option key={x.id} value={x.id}>Set {x.code}</option>)}
              <option value="none">Not in a set</option>
            </select>
          }
        >
          <table className="w-full text-sm">
            <thead className="text-left text-[#5b6865]">
              <tr><th className="py-1">#</th><th>Reward</th><th>Given out when</th><th>Issued</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id} className="border-t border-[#eef1ef]">
                  <td className="py-2 font-bold">{label(b) || "–"}</td>
                  <td><span className="font-semibold">{b.title}</span><br /><span className="text-[#5b6865]">{b.brand_name}{b.min_age === 25 ? ", spirits 25+" : b.is_alcohol ? ", beer/wine 21+" : ""}</span></td>
                  <td>{b.set_id ? <span className={b.rule === "random" ? "" : "font-semibold text-[#0f7a5c]"}>{ruleText(b)}</span> : "Question bonus"}</td>
                  <td className="tabular">{b.issued_count}{b.total_quantity ? ` / ${b.total_quantity}` : ""}</td>
                  <td>{b.is_active ? "Active" : "Off"}</td>
                  <td className="text-right"><button className="btn btn-line !py-1" onClick={() => edit(b)}>Edit</button></td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-[#5b6865]">No coupons here yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- themes
export function ThemesPanel() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [t, setT] = useState<Theme>({ ...DEFAULT_THEME, id: "", name: "" });
  const s = useStatus();
  const set = <K extends keyof Theme>(k: K, v: Theme[K]) => setT((x) => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    const { data } = await supabase().from("themes").select("*").order("name");
    setThemes((data as Theme[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { id, ...row } = t;
    const payload = { ...row, logo_url: row.logo_url || null, sponsor_name: row.sponsor_name || null };
    const { error } = id
      ? await supabase().from("themes").update(payload).eq("id", id)
      : await supabase().from("themes").insert(payload);
    if (error) return s.fail(error.message.includes("bg_value") ? "Background value doesn't match the type. Use #RRGGBB, a linear-/radial-gradient(...) or an https image URL." : error);
    s.ok("Theme saved.");
    setT({ ...DEFAULT_THEME, id: "", name: "" });
    load();
  }

  const color = (k: "primary_color" | "secondary_color" | "text_color" | "surface_color", label: string) => (
    <label>
      {label}
      <span className="mt-1 flex gap-2">
        <input type="color" className="!h-10 !w-14 !p-1" value={t[k]} onChange={(e) => set(k, e.target.value.toUpperCase())} />
        <input value={t[k]} onChange={(e) => set(k, e.target.value)} />
      </span>
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_320px_1fr]">
      <Card title={t.id ? "Edit theme" : "New theme"}>
        <form onSubmit={save} className="flex flex-col gap-3">
          <label>Name<input required value={t.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label>Sponsor name<input value={t.sponsor_name ?? ""} onChange={(e) => set("sponsor_name", e.target.value)} /></label>
          <label>Sponsor logo URL (https)<input value={t.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} /></label>
          <label>
            Background type
            <select value={t.bg_type} onChange={(e) => set("bg_type", e.target.value as BgType)}>
              <option value="solid">Solid colour</option>
              <option value="gradient">Gradient</option>
              <option value="image">Image</option>
            </select>
          </label>
          <label>
            Background value
            <input
              value={t.bg_value}
              onChange={(e) => set("bg_value", e.target.value)}
              placeholder={t.bg_type === "solid" ? "#0C2427" : t.bg_type === "gradient" ? "linear-gradient(160deg, #7F1D1D 0%, #111111 70%)" : "https://..."}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {color("primary_color", "Primary")}
            {color("secondary_color", "Secondary")}
            {color("text_color", "Text")}
            {color("surface_color", "Cards")}
          </div>
          <button className="btn btn-dark">Save theme</button>
          {s.node}
        </form>
      </Card>

      <div>
        <p className="mb-2 text-sm font-semibold text-[#3b4745]">Live preview</p>
        <div className="brand-canvas overflow-hidden rounded-[2rem] border-8 border-[#17201f] p-4" style={{ ...themeVars(t), backgroundAttachment: "scroll" }}>
          <div className="flex items-center gap-2">
            {t.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo_url} alt="" className="h-7 w-auto" />
            )}
            <p className="font-display text-lg font-bold">MI vs CSK</p>
            <span className="tabular ml-auto rounded-lg bg-black/30 px-2 py-1 font-display text-lg font-bold text-brand">120</span>
          </div>
          <div className="mt-4 rounded-2xl bg-surface/90 p-4">
            <p className="font-display font-semibold text-brand-2">10 points + Free pint</p>
            <p className="font-display text-2xl font-bold leading-tight">Will the next over go for 10+ runs?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="rounded-xl border-2 border-brand bg-brand px-3 py-2 font-display text-lg font-semibold text-on-brand">Yes</span>
              <span className="rounded-xl border-2 border-ink/20 bg-black/20 px-3 py-2 font-display text-lg font-semibold">No</span>
            </div>
          </div>
          <div className="mt-4 h-24" />
        </div>
      </div>

      <Card title="Themes">
        <ul className="flex flex-col gap-2">
          {themes.map((x) => (
            <li key={x.id} className="flex items-center gap-3 rounded-lg border border-[#eef1ef] p-2">
              <span className="size-10 shrink-0 rounded-md" style={{ background: themeVars(x)["--brand-bg" as keyof React.CSSProperties] as string }} />
              <span className="size-5 shrink-0 rounded-full" style={{ background: x.primary_color }} />
              <span className="flex-1 font-semibold">{x.name}</span>
              <button className="btn btn-line !py-1" onClick={() => setT(x)}>Edit</button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- venues
type VenueForm = { id: string | null; name: string; slug: string; address: string; city: string; coords: string; radius: number; theme_id: string; is_active: boolean };
const EMPTY_VENUE: VenueForm = { id: null, name: "", slug: "", address: "", city: "Mumbai", coords: "", radius: 150, theme_id: "", is_active: true };

export function VenuesPanel() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [f, setF] = useState<VenueForm>(EMPTY_VENUE);
  const [origin, setOrigin] = useState("");
  const s = useStatus();
  const set = <K extends keyof VenueForm>(k: K, v: VenueForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: v }, { data: t }] = await Promise.all([
      sb.from("venue_directory").select("*").order("name"),
      sb.from("themes").select("*").order("name"),
    ]);
    setVenues((v as Venue[]) ?? []);
    setThemes((t as Theme[]) ?? []);
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  function useHere() {
    navigator.geolocation.getCurrentPosition(
      (p) => set("coords", `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`),
      () => s.fail("Couldn't read this device's location."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const m = f.coords.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return s.fail("Paste coordinates like 18.9937, 72.8258 (Google Maps, right-click the venue).");
    const { error } = await supabase().rpc("upsert_venue", {
      p_id: f.id,
      p_name: f.name.trim(),
      p_slug: f.slug.trim().toLowerCase(),
      p_address: f.address.trim() || null,
      p_city: f.city.trim() || "Mumbai",
      p_lat: Number(m[1]),
      p_lng: Number(m[2]),
      p_radius: f.radius,
      p_theme_id: f.theme_id || null,
      p_active: f.is_active,
    });
    if (error) return s.fail(error.message.includes("slug") ? "Link name must be 3 to 40 lowercase letters, numbers or hyphens, and unique." : error);
    s.ok("Venue saved.");
    setF(EMPTY_VENUE);
    load();
  }

  function downloadQr(slug: string) {
    const svg = document.getElementById(`qr-${slug}`);
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `coaster-${slug}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-6">
    <AccountsCard />
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card title={f.id ? "Edit venue" : "New venue"} aside={f.id && <button className="btn btn-line" onClick={() => setF(EMPTY_VENUE)}>New instead</button>}>
        <form onSubmit={save} className="flex flex-col gap-3">
          <label>Venue name<input required value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label>
            Link name (goes on the coaster)
            <input required value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="the-dugout-bandra" />
          </label>
          <label>Address<input value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
          <label>City<input value={f.city} onChange={(e) => set("city", e.target.value)} /></label>
          <label>
            Coordinates (lat, lng)
            <input required value={f.coords} onChange={(e) => set("coords", e.target.value)} placeholder="18.9937, 72.8258" />
          </label>
          <button type="button" className="btn btn-line self-start" onClick={useHere}>Use this device&apos;s location</button>
          <label>
            Check-in radius: {f.radius} m
            <input type="range" min={50} max={400} step={10} value={f.radius} onChange={(e) => set("radius", Number(e.target.value))} />
          </label>
          <label>
            Default theme
            <select value={f.theme_id} onChange={(e) => set("theme_id", e.target.value)}>
              <option value="">Built-in Floodlight</option>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="!flex items-center gap-2">
            <input type="checkbox" className="!w-auto" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            Active
          </label>
          <button className="btn btn-dark">Save venue</button>
          {s.node}
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {venues.map((v) => {
          const url = `${origin}/v/${v.slug}`;
          return (
            <article key={v.id} className="flex flex-col gap-3 rounded-xl border border-[#d8dedb] bg-white p-4">
              <div>
                <h3 className="font-bold">{v.name} {!v.is_active && <span className="text-sm font-normal text-[#5b6865]">(inactive)</span>}</h3>
                <p className="text-sm text-[#5b6865]">{v.address ? `${v.address}, ` : ""}{v.city} · {v.geofence_radius_m} m</p>
              </div>
              <div className="self-center rounded-lg bg-white p-2">
                <QRCodeSVG id={`qr-${v.slug}`} value={url} size={150} level="M" marginSize={2} />
              </div>
              <p className="break-all text-xs text-[#5b6865]">{url}</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-line !py-1" onClick={() => downloadQr(v.slug)}>Download QR</button>
                <button
                  className="btn btn-line !py-1"
                  onClick={() => setF({ id: v.id, name: v.name, slug: v.slug, address: v.address ?? "", city: v.city, coords: `${v.lat}, ${v.lng}`, radius: v.geofence_radius_m, theme_id: v.default_theme_id ?? "", is_active: v.is_active })}
                >
                  Edit
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
    </div>
  );
}

// ---------------------------------------------------------------- offers (banners)
export function OffersPanel() {
  const [banners, setBanners] = useState<(Banner & { is_active: boolean })[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [f, setF] = useState({ title: "", subtitle: "", image_url: "", link_url: "", venue_id: "", sort_order: 0 });
  const s = useStatus();

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: b }, { data: v }] = await Promise.all([
      sb.from("banners").select("*").order("sort_order"),
      sb.from("venues").select("id, name").order("name"),
    ]);
    setBanners((b as (Banner & { is_active: boolean })[]) ?? []);
    setVenues((v as Venue[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("banners").insert({
      title: f.title.trim(),
      subtitle: f.subtitle.trim() || null,
      image_url: f.image_url.trim() || null,
      link_url: f.link_url.trim() || null,
      venue_id: f.venue_id || null,
      sort_order: f.sort_order,
    });
    if (error) return s.fail(error);
    setF({ title: "", subtitle: "", image_url: "", link_url: "", venue_id: "", sort_order: 0 });
    s.ok("Offer added.");
    load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card title="New offer banner">
        <form onSubmit={save} className="flex flex-col gap-3">
          <label>Headline<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label>Details<input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></label>
          <label>Image URL (https, 16:9)<input type="url" pattern="https://.*" value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} /></label>
          <label>Link (https, optional)<input type="url" pattern="https://.*" value={f.link_url} onChange={(e) => setF({ ...f, link_url: e.target.value })} /></label>
          <label>
            Show at
            <select value={f.venue_id} onChange={(e) => setF({ ...f, venue_id: e.target.value })}>
              <option value="">All venues</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label>Order<input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} /></label>
          <button className="btn btn-dark">Add offer</button>
          {s.node}
        </form>
      </Card>
      <Card title="Offers">
        <ul className="flex flex-col gap-2">
          {banners.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#eef1ef] px-3 py-2">
              <span>
                <span className="font-semibold">{b.title}</span>
                <span className="block text-sm text-[#5b6865]">{venues.find((v) => v.id === b.venue_id)?.name ?? "All venues"}</span>
              </span>
              <span className="flex gap-2">
                <button className="btn btn-line !py-1" onClick={async () => { await supabase().from("banners").update({ is_active: !b.is_active }).eq("id", b.id); load(); }}>
                  {b.is_active ? "Hide" : "Show"}
                </button>
                <button className="btn btn-line !py-1" onClick={async () => { await supabase().from("banners").delete().eq("id", b.id); load(); }}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- staff accounts
export function StaffPanel() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [staff, setStaff] = useState<{ user_id: string; role: string; venue_id: string | null; name: string | null }[]>([]);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "venue_manager", venue_id: "" });
  const s = useStatus();

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: v }, { data: st }] = await Promise.all([
      sb.from("venues").select("id, name").order("name"),
      sb.from("staff").select("user_id, role, venue_id, name").order("created_at"),
    ]);
    setVenues((v as Venue[]) ?? []);
    setStaff(st ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase().auth.getSession();
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ ...f, venue_id: f.venue_id || null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return s.fail(body.error ?? "Couldn't create the account.");
    s.ok("Staff account created. Share the email and password with them.");
    setF({ name: "", email: "", password: "", role: "venue_manager", venue_id: "" });
    load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card title="Add staff account">
        <form onSubmit={create} className="flex flex-col gap-3">
          <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label>Temporary password<input required minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          <label>
            Role
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="venue_manager">Venue manager (PIN, players, redeem)</option>
              <option value="game_master">Game Master (questions, rewards, themes)</option>
              <option value="admin">Admin (everything)</option>
            </select>
          </label>
          {f.role === "venue_manager" && (
            <label>
              Venue
              <select required value={f.venue_id} onChange={(e) => setF({ ...f, venue_id: e.target.value })}>
                <option value="">Pick a venue</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          )}
          <button className="btn btn-dark">Create account</button>
          {s.node}
        </form>
      </Card>
      <Card title="Staff">
        <table className="w-full text-sm">
          <thead className="text-left text-[#5b6865]"><tr><th className="py-1">Name</th><th>Role</th><th>Venue</th></tr></thead>
          <tbody>
            {staff.map((x) => (
              <tr key={x.user_id} className="border-t border-[#eef1ef]">
                <td className="py-2">{x.name ?? x.user_id.slice(0, 8)}</td>
                <td>{x.role.replace("_", " ")}</td>
                <td>{venues.find((v) => v.id === x.venue_id)?.name ?? "All"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- analytics
export function AnalyticsPanel() {
  const [rows, setRows] = useState<{ id: string; title: string; brand: string; issued: number; clicks: number; uniq: number }[]>([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [{ data: b }, { data: c }] = await Promise.all([
        sb.from("coupon_buckets").select("id, title, brand_name, issued_count"),
        sb.from("click_analytics").select("bucket_id, user_id").gte("clicked_at", since).limit(50000),
      ]);
      const clicks = new Map<string, { n: number; users: Set<string> }>();
      for (const r of (c as { bucket_id: string; user_id: string | null }[]) ?? []) {
        const e = clicks.get(r.bucket_id) ?? { n: 0, users: new Set<string>() };
        e.n++;
        if (r.user_id) e.users.add(r.user_id);
        clicks.set(r.bucket_id, e);
      }
      setRows(
        ((b as { id: string; title: string; brand_name: string; issued_count: number }[]) ?? [])
          .map((x) => ({ id: x.id, title: x.title, brand: x.brand_name, issued: x.issued_count, clicks: clicks.get(x.id)?.n ?? 0, uniq: clicks.get(x.id)?.users.size ?? 0 }))
          .sort((a, z) => z.clicks - a.clicks),
      );
    })();
  }, [days]);

  const csv = () => {
    const lines = [["Reward", "Brand", "Issued (all time)", `Clicks (${days}d)`, `Unique clickers (${days}d)`], ...rows.map((r) => [r.title, r.brand, r.issued, r.clicks, r.uniq])];
    const blob = new Blob([lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reward-clicks-${days}d.csv`;
    a.click();
  };

  return (
    <Card
      title="Reward performance"
      aside={
        <span className="flex gap-2">
          <select className="!w-32" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button className="btn btn-line" onClick={csv}>Export CSV</button>
        </span>
      }
    >
      <table className="w-full text-sm">
        <thead className="text-left text-[#5b6865]">
          <tr><th className="py-1">Reward</th><th>Issued</th><th>Clicks</th><th>Unique</th><th>Click rate</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="tabular border-t border-[#eef1ef]">
              <td className="py-2"><span className="font-semibold">{r.title}</span> <span className="text-[#5b6865]">{r.brand}</span></td>
              <td>{r.issued}</td>
              <td>{r.clicks}</td>
              <td>{r.uniq}</td>
              <td>{r.issued ? `${Math.round((r.uniq / r.issued) * 100)}%` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------- settings (legal + security)
type SettingsForm = {
  terms_url: string;
  privacy_url: string;
  operator_name: string;
  operator_address: string;
  grievance_name: string;
  grievance_email: string;
  support_email: string;
  require_staff_mfa: boolean;
};

export function SettingsPanel() {
  const [f, setF] = useState<SettingsForm | null>(null);
  const s = useStatus();
  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setF((x) => (x ? { ...x, [k]: v } : x));

  const load = useCallback(async () => {
    const { data } = await supabase().from("app_settings").select("*").maybeSingle();
    const d = (data ?? {}) as Partial<Record<keyof SettingsForm, string | boolean | null>>;
    setF({
      terms_url: (d.terms_url as string) ?? "",
      privacy_url: (d.privacy_url as string) ?? "",
      operator_name: (d.operator_name as string) ?? "",
      operator_address: (d.operator_address as string) ?? "",
      grievance_name: (d.grievance_name as string) ?? "",
      grievance_email: (d.grievance_email as string) ?? "",
      support_email: (d.support_email as string) ?? "",
      require_staff_mfa: d.require_staff_mfa !== false,
    });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    if (!f.require_staff_mfa && !confirm("Turning off 2-step login makes every staff account easier to break into. Continue?")) return;
    const clean = (v: string) => v.trim() || null;
    const { error } = await supabase()
      .from("app_settings")
      .update({
        terms_url: clean(f.terms_url),
        privacy_url: clean(f.privacy_url),
        operator_name: clean(f.operator_name),
        operator_address: clean(f.operator_address),
        grievance_name: clean(f.grievance_name),
        grievance_email: clean(f.grievance_email),
        support_email: clean(f.support_email),
        require_staff_mfa: f.require_staff_mfa,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error)
      return s.fail(
        error.message.includes("url") ? "Links must start with https://" : error.message.includes("email") ? "Check the email addresses." : error,
      );
    s.ok("Settings saved. Players see the new links right away.");
    load();
  }

  if (!f) return null;
  const missing = !f.operator_name || !f.grievance_email;

  return (
    <div className="grid gap-6 lg:grid-cols-[520px_1fr]">
      <Card title="Legal and contact">
        <form onSubmit={save} className="flex flex-col gap-3">
          {missing && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Add the company name and a grievance email before public launch. They appear in the Terms and Privacy Notice.
            </p>
          )}
          <label>
            Terms of Use link (https)
            <input type="url" pattern="https://.*" value={f.terms_url} onChange={(e) => set("terms_url", e.target.value)} placeholder="Leave empty to use the built-in /terms page" />
          </label>
          <label>
            Privacy Notice link (https)
            <input type="url" pattern="https://.*" value={f.privacy_url} onChange={(e) => set("privacy_url", e.target.value)} placeholder="Leave empty to use the built-in /privacy page" />
          </label>
          <label>Company name (operator)<input value={f.operator_name} onChange={(e) => set("operator_name", e.target.value)} placeholder="e.g. SportsAura Technologies Private Limited" /></label>
          <label>Registered address<input value={f.operator_address} onChange={(e) => set("operator_address", e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label>Grievance officer name<input value={f.grievance_name} onChange={(e) => set("grievance_name", e.target.value)} /></label>
            <label>Grievance officer email<input type="email" value={f.grievance_email} onChange={(e) => set("grievance_email", e.target.value)} /></label>
          </div>
          <label>Support email<input type="email" value={f.support_email} onChange={(e) => set("support_email", e.target.value)} /></label>
          <label className="!flex items-start gap-2 rounded-lg bg-[#f1f5f3] p-3">
            <input type="checkbox" className="!mt-1 !w-auto" checked={f.require_staff_mfa} onChange={(e) => set("require_staff_mfa", e.target.checked)} />
            <span>
              Require 2-step login for all staff (recommended)
              <span className="mt-0.5 block font-normal text-[#5b6865]">Staff sign in with a password plus a code from an authenticator app.</span>
            </span>
          </label>
          <button className="btn btn-dark">Save settings</button>
          {s.node}
        </form>
      </Card>
      <div className="flex flex-col gap-6">
      <PricingCard />
      <Card title="Where these appear">
        <ul className="list-disc space-y-2 pl-5 text-sm text-[#3b4745]">
          <li>The <strong>Terms</strong> and <strong>Privacy</strong> links at the bottom of the sign-in screen, the setup screen and the game screen open your links if set, otherwise the built-in pages.</li>
          <li>Built-in pages: <a className="underline" href="/terms" target="_blank">/terms</a> and <a className="underline" href="/privacy" target="_blank">/privacy</a>. They fill in the company and grievance details above automatically.</li>
          <li>Every change here is recorded in the Audit tab.</li>
        </ul>
      </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- audit log
type AuditRow = { id: number; at: string; actor_name: string | null; action: string; entity: string; summary: string | null; details: unknown };

export function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [entity, setEntity] = useState("all");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let q = supabase().from("audit_log").select("*").order("at", { ascending: false }).limit(300);
    if (entity !== "all") q = q.eq("entity", entity);
    q.then(({ data }) => setRows((data as AuditRow[]) ?? []));
  }, [entity]);

  const labels: Record<string, string> = {
    question: "Questions", coupon_buckets: "Rewards", reward_sets: "Reward sets", matches: "Matches", venues: "Venues",
    staff: "Staff", banners: "Offers", app_settings: "Settings", user_coupon: "Redemptions", coupon_bucket_secrets: "Reward links/codes",
  };

  return (
    <Card
      title="Audit log"
      aside={
        <select className="!w-48" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="all">Everything</option>
          {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      }
    >
      <p className="mb-3 text-sm text-[#5b6865]">Who did what, and when. Entries can&apos;t be edited or deleted.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-[#5b6865]">
          <tr><th className="py-1">When</th><th>Who</th><th>What</th><th>Item</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer border-t border-[#eef1ef] align-top" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <td className="tabular whitespace-nowrap py-2 pr-3">{new Date(r.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td className="pr-3">{r.actor_name ?? "system"}</td>
              <td className="pr-3">{r.action} {labels[r.entity] ? `(${labels[r.entity]})` : r.entity}</td>
              <td>
                {r.summary}
                {open === r.id && r.details != null && (
                  <pre className="mt-2 max-w-xl overflow-x-auto rounded bg-[#f1f5f3] p-2 text-xs">{JSON.stringify(r.details, null, 2)}</pre>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-[#5b6865]">Nothing recorded yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------- question packs
const EMPTY_TPL = { id: "", pack: "", sport: "cricket", prompt: "", options: "Yes\nNo", points: 10, answer_window_s: 30 };

export function PacksPanel() {
  const [rows, setRows] = useState<QuestionTemplate[]>([]);
  const [sport, setSport] = useState("cricket");
  const [f, setF] = useState(EMPTY_TPL);
  const s = useStatus();

  const load = useCallback(async () => {
    const { data } = await supabase().from("question_templates").select("*").order("pack").order("sort_order");
    setRows((data as QuestionTemplate[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const options = f.options.split("\n").map((o) => o.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 6) return s.fail("Give 2 to 6 options, one per line.");
    const row = { pack: f.pack.trim(), sport: f.sport, prompt: f.prompt.trim(), options, points: f.points, answer_window_s: f.answer_window_s };
    const { error } = f.id
      ? await supabase().from("question_templates").update(row).eq("id", f.id)
      : await supabase().from("question_templates").insert({ ...row, sort_order: rows.filter((r) => r.pack === row.pack).length + 1 });
    if (error) return s.fail(error);
    s.ok(f.id ? "Question updated." : "Question added to the pack.");
    setF({ ...EMPTY_TPL, pack: f.pack, sport: f.sport });
    load();
  }

  async function toggle(t: QuestionTemplate) {
    const { error } = await supabase().from("question_templates").update({ is_active: !t.is_active }).eq("id", t.id);
    if (error) return s.fail(error);
    load();
  }

  const list = rows.filter((r) => r.sport === sport);
  const packs = [...new Set(list.map((r) => r.pack))];

  return (
    <div className="flex flex-col gap-6">
    <AiPackWriter onSaved={load} />
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card title={f.id ? "Edit pack question" : "Add a pack question"} aside={f.id && <button className="btn btn-line" onClick={() => setF(EMPTY_TPL)}>New instead</button>}>
        <form onSubmit={save} className="flex flex-col gap-3">
          <label>Sport
            <select value={f.sport} onChange={(e) => setF({ ...f, sport: e.target.value })}>
              <option value="cricket">Cricket</option><option value="football">Football</option>
            </select>
          </label>
          <label>Pack name<input required list="pack-names" value={f.pack} onChange={(e) => setF({ ...f, pack: e.target.value })} placeholder="Over by over" /></label>
          <datalist id="pack-names">{[...new Set(rows.map((r) => r.pack))].map((p) => <option key={p} value={p} />)}</datalist>
          <label>Question<input required maxLength={160} value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} placeholder="Over {over}: how many runs?" /></label>
          <label>Options, one per line<textarea rows={4} value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} /></label>
          <p className="text-xs text-[#5b6865]">{"{over}"} becomes the current over. {"{home}"} and {"{away}"} become the teams from the match title (&quot;Mumbai vs Chennai&quot;).</p>
          <div className="grid grid-cols-2 gap-3">
            <label>Points<input type="number" min={1} max={1000} value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) })} /></label>
            <label>Answer window
              <select value={f.answer_window_s} onChange={(e) => setF({ ...f, answer_window_s: Number(e.target.value) })}>
                {[15, 20, 30, 45, 60, 90].map((x) => <option key={x} value={x}>{x} seconds</option>)}
              </select>
            </label>
          </div>
          <button className="btn btn-dark">{f.id ? "Save" : "Add to pack"}</button>
          {s.node}
        </form>
      </Card>
      <Card
        title="Question packs"
        aside={
          <select className="!w-40" value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="cricket">Cricket</option><option value="football">Football</option>
          </select>
        }
      >
        <p className="mb-3 text-sm text-[#5b6865]">The Live tab cycles through a pack in order. Paused questions are skipped.</p>
        {packs.map((p) => (
          <div key={p} className="mb-4">
            <h3 className="mb-1 font-bold">{p}</h3>
            <ul className="flex flex-col divide-y divide-[#eef1ef] rounded-lg border border-[#eef1ef]">
              {list.filter((r) => r.pack === p).map((t) => (
                <li key={t.id} className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${t.is_active ? "" : "opacity-50"}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t.prompt}</span>
                    <span className="block truncate text-[#5b6865]">{t.options.join(" / ")} · {t.points} pts · {t.answer_window_s}s</span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button className="btn btn-line !py-1" onClick={() => setF({ id: t.id, pack: t.pack, sport: t.sport, prompt: t.prompt, options: t.options.join("\n"), points: t.points, answer_window_s: t.answer_window_s })}>Edit</button>
                    <button className="btn btn-line !py-1" onClick={() => toggle(t)}>{t.is_active ? "Pause" : "Use"}</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {packs.length === 0 && <p className="text-sm text-[#5b6865]">No packs for this sport yet.</p>}
      </Card>
    </div>
    </div>
  );
}

// ---------------------------------------------------------------- sponsors + city seasons
const EMPTY_SPONSOR = { id: "", name: "", logo_url: "", tagline: "", link_url: "" };
type SponsorStat = { sponsor_id: string; sponsor: string; questions: number; plays: number; players: number; venues: number; matches: number };

export function SponsorsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<Sponsor[]>([]);
  const [stats, setStats] = useState<SponsorStat[]>([]);
  const [days, setDays] = useState(30);
  const [f, setF] = useState(EMPTY_SPONSOR);
  const s = useStatus();

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data }, { data: st }] = await Promise.all([
      sb.from("sponsors").select("*").order("name"),
      sb.rpc("sponsor_report", { p_from: new Date(Date.now() - days * 86400000).toISOString(), p_to: new Date().toISOString() }),
    ]);
    setRows((data as Sponsor[]) ?? []);
    setStats((st as SponsorStat[]) ?? []);
  }, [days]);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clean = (v: string) => v.trim() || null;
    const row = { name: f.name.trim(), logo_url: clean(f.logo_url), tagline: clean(f.tagline), link_url: clean(f.link_url) };
    const { error } = f.id ? await supabase().from("sponsors").update(row).eq("id", f.id) : await supabase().from("sponsors").insert(row);
    if (error) return s.fail(error.message.includes("url") ? "Links must start with https://" : error);
    s.ok("Sponsor saved.");
    setF(EMPTY_SPONSOR);
    load();
  }

  const stat = (id: string) => stats.find((x) => x.sponsor_id === id);
  const csv = () => {
    const lines = [["Sponsor", "Questions", "Plays", "Unique players", "Venues", "Matches"], ...stats.map((r) => [r.sponsor, r.questions, r.plays, r.players, r.venues, r.matches])];
    const blob = new Blob([lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sponsor-report-${days}d.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card title={f.id ? "Edit sponsor" : "New sponsor"} aside={f.id && <button className="btn btn-line" onClick={() => setF(EMPTY_SPONSOR)}>New instead</button>}>
          <form onSubmit={save} className="flex flex-col gap-3">
            <label>Brand name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. a cab app" /></label>
            <label>Logo link (https, optional)<input type="url" value={f.logo_url} onChange={(e) => setF({ ...f, logo_url: e.target.value })} /></label>
            <label>Tagline (optional)<input maxLength={90} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} placeholder="Get home safe after the match" /></label>
            <label>Website (https, optional)<input type="url" value={f.link_url} onChange={(e) => setF({ ...f, link_url: e.target.value })} /></label>
            <button className="btn btn-dark">Save sponsor</button>
            {s.node}
            <p className="text-xs text-[#5b6865]">Pick a sponsor for a whole match in the Live tab (&quot;Presented by&quot;) or for single overs. No alcohol brands: surrogate alcohol advertising rules apply.</p>
          </form>
        </Card>
        <Card
          title="Sponsor report"
          aside={
            <span className="flex gap-2">
              <select className="!w-32" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
              </select>
              <button className="btn btn-line" onClick={csv}>Export CSV</button>
            </span>
          }
        >
          <p className="mb-3 text-sm text-[#5b6865]">What each brand got: sponsored questions, answers given while their name was on screen, unique players and venues. Send this to the brand.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-[#5b6865]">
              <tr><th className="py-1">Sponsor</th><th>Questions</th><th>Plays</th><th>Players</th><th>Venues</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const x = stat(r.id);
                return (
                  <tr key={r.id} className={`tabular border-t border-[#eef1ef] ${r.is_active ? "" : "opacity-50"}`}>
                    <td className="py-2 font-semibold">{r.name}</td>
                    <td>{x?.questions ?? 0}</td>
                    <td>{x?.plays ?? 0}</td>
                    <td>{x?.players ?? 0}</td>
                    <td>{x?.venues ?? 0}</td>
                    <td className="text-right">
                      <button className="btn btn-line !py-1" onClick={() => setF({ id: r.id, name: r.name, logo_url: r.logo_url ?? "", tagline: r.tagline ?? "", link_url: r.link_url ?? "" })}>Edit</button>{" "}
                      <button className="btn btn-line !py-1" onClick={async () => { await supabase().from("sponsors").update({ is_active: !r.is_active }).eq("id", r.id); load(); }}>
                        {r.is_active ? "Pause" : "Use"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#5b6865]">No sponsors yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
      <SeasonsCard sponsors={rows} isAdmin={isAdmin} />
    </div>
  );
}

const EMPTY_SEASON = { id: "", name: "", city: "Mumbai", starts_on: "", ends_on: "", prize_text: "", prize_terms_url: "", sponsor_id: "" };

function SeasonsCard({ sponsors, isAdmin }: { sponsors: Sponsor[]; isAdmin: boolean }) {
  const [rows, setRows] = useState<Season[]>([]);
  const [f, setF] = useState(EMPTY_SEASON);
  const s = useStatus();
  const load = useCallback(async () => {
    const { data } = await supabase().from("seasons").select("*").order("starts_on", { ascending: false });
    setRows((data as Season[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.prize_text.trim() && !f.prize_terms_url.trim() && !confirm("A prize without a terms link is risky. Have a lawyer approve prize terms first. Save anyway?")) return;
    const clean = (v: string) => v.trim() || null;
    const row = { name: f.name.trim(), city: f.city.trim(), starts_on: f.starts_on, ends_on: f.ends_on, prize_text: clean(f.prize_text), prize_terms_url: clean(f.prize_terms_url), sponsor_id: f.sponsor_id || null };
    const { error } = f.id ? await supabase().from("seasons").update(row).eq("id", f.id) : await supabase().from("seasons").insert(row);
    if (error) return s.fail(error.message.includes("dates") ? "The end date must be after the start date." : error.message.includes("url") ? "Links must start with https://" : error);
    s.ok("Season saved.");
    setF(EMPTY_SEASON);
    load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card title={f.id ? "Edit city season" : "New city season"}>
        {!isAdmin ? (
          <p className="text-sm text-[#5b6865]">Only admins can set up city seasons.</p>
        ) : (
          <form onSubmit={save} className="flex flex-col gap-3">
            <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Mumbai IPL 2027 season" /></label>
            <label>City<input required value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label>Starts<input required type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></label>
              <label>Ends<input required type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></label>
            </div>
            <label>Season prize (optional)<input maxLength={160} value={f.prize_text} onChange={(e) => setF({ ...f, prize_text: e.target.value })} placeholder="Top 3 win a ride voucher from [sponsor]" /></label>
            <label>Prize terms link (https)<input type="url" value={f.prize_terms_url} onChange={(e) => setF({ ...f, prize_terms_url: e.target.value })} /></label>
            <label>Prize sponsor
              <select value={f.sponsor_id} onChange={(e) => setF({ ...f, sponsor_id: e.target.value })}>
                <option value="">None</option>
                {sponsors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Have a lawyer approve the prize terms before showing a prize. The leaderboard works without one.
            </p>
            <button className="btn btn-dark">Save season</button>
            {s.node}
          </form>
        )}
      </Card>
      <Card title="City seasons">
        <p className="mb-3 text-sm text-[#5b6865]">Players in that city see a &quot;City season&quot; tab in Ranks: points from every match at every venue in the city, between these dates.</p>
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className={`flex items-center justify-between gap-3 rounded-lg border border-[#eef1ef] px-3 py-2 text-sm ${r.is_active ? "" : "opacity-50"}`}>
              <span>
                <span className="block font-semibold">{r.name} · {r.city}</span>
                <span className="block text-[#5b6865]">{r.starts_on} to {r.ends_on}{r.prize_text ? ` · Prize: ${r.prize_text}` : ""}</span>
              </span>
              {isAdmin && (
                <span className="flex shrink-0 gap-2">
                  <button className="btn btn-line !py-1" onClick={() => setF({ id: r.id, name: r.name, city: r.city, starts_on: r.starts_on, ends_on: r.ends_on, prize_text: r.prize_text ?? "", prize_terms_url: r.prize_terms_url ?? "", sponsor_id: r.sponsor_id ?? "" })}>Edit</button>
                  <button className="btn btn-line !py-1" onClick={async () => { await supabase().from("seasons").update({ is_active: !r.is_active }).eq("id", r.id); load(); }}>{r.is_active ? "Hide" : "Show"}</button>
                </span>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="py-4 text-center text-sm text-[#5b6865]">No seasons yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- venue accounts (signups, plans, billing)
type AccountRow = VenueAccount & { venues: { name: string; slug: string; city: string; is_active: boolean } };
type PaymentRow = { id: string; venue_id: string; plan: VenuePlan; amount_paise: number; status: string; created_at: string; paid_at: string | null };
const PLAN_LABEL: Record<VenuePlan, string> = { pilot: "Free pilot", season: "Season pass", per_reward: "Pay per reward" };
const STATUS_LABEL: Record<BillingStatus, string> = { pending: "Waiting for approval", trial: "Trial", active: "Active", past_due: "Payment due", cancelled: "Cancelled" };

export function AccountsCard() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const s = useStatus();
  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data }, { data: p }] = await Promise.all([
      sb.from("venue_accounts").select("*, venues(name, slug, city, is_active)").order("created_at", { ascending: false }),
      sb.from("payments").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setRows((data as AccountRow[]) ?? []);
    setPayments((p as PaymentRow[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(r: AccountRow, acc: Partial<VenueAccount>, activeVenue?: boolean, msg = "Saved.") {
    const sb = supabase();
    const { error } = await sb.from("venue_accounts").update({ ...acc, updated_at: new Date().toISOString() }).eq("venue_id", r.venue_id);
    if (error) return s.fail(error);
    if (activeVenue !== undefined) {
      const { error: e2 } = await sb.from("venues").update({ is_active: activeVenue }).eq("id", r.venue_id);
      if (e2) return s.fail(e2);
    }
    s.ok(msg);
    load();
  }

  const pending = rows.filter((r) => r.status === "pending");
  const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  return (
    <Card title="Venue accounts and billing" aside={pending.length > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{pending.length} waiting</span>}>
      {s.node}
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-[#5b6865]">
          <tr><th className="py-1">Venue</th><th>Contact</th><th>Plan</th><th>Status</th><th>Paid until</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.venue_id} className={`border-t border-[#eef1ef] align-top ${r.status === "pending" ? "bg-amber-50" : ""}`}>
              <td className="py-2">
                <span className="block font-semibold">{r.venues?.name}</span>
                <span className="block text-[#5b6865]">{r.venues?.city}{r.venues && !r.venues.is_active ? " · not live" : ""}</span>
              </td>
              <td className="text-[#3b4745]">
                {r.contact_name}<br />{r.contact_phone}<br />{r.contact_email}
              </td>
              <td>
                <select className="!w-36 !py-1" value={r.plan} onChange={(e) => patch(r, { plan: e.target.value as VenuePlan })}>
                  {(Object.keys(PLAN_LABEL) as VenuePlan[]).map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
                </select>
              </td>
              <td>{STATUS_LABEL[r.status]}</td>
              <td>{r.paid_until ?? "–"}</td>
              <td className="flex flex-wrap justify-end gap-1 py-2">
                {r.status === "pending" && (
                  <>
                    <button className="btn btn-go !py-1" onClick={() => patch(r, { status: "trial", approved_at: new Date().toISOString(), paid_until: inDays(14) }, true, "Approved: 14-day trial, venue is live.")}>
                      Approve, 14-day trial
                    </button>
                    <button className="btn btn-line !py-1" onClick={() => confirm("Reject this signup? The venue stays offline.") && patch(r, { status: "cancelled" }, false, "Rejected.")}>
                      Reject
                    </button>
                  </>
                )}
                {r.status !== "pending" && (
                  <>
                    <button className="btn btn-line !py-1" onClick={() => { const d = prompt("Paid until (YYYY-MM-DD)", r.paid_until ?? inDays(90)); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) patch(r, { status: "active", paid_until: d }, true, "Marked as paid."); }}>
                      Mark paid
                    </button>
                    {r.status !== "cancelled" ? (
                      <button className="btn btn-line !py-1" onClick={() => confirm("Pause this venue? Players can't check in until you turn it back on.") && patch(r, { status: "cancelled" }, false, "Venue paused.")}>Pause</button>
                    ) : (
                      <button className="btn btn-line !py-1" onClick={() => patch(r, { status: "active" }, true, "Venue back on.")}>Turn back on</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {payments.length > 0 && (
        <>
          <h3 className="mt-5 font-bold">Recent online payments</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between rounded bg-[#f6f8f7] px-3 py-1.5">
                <span>{rows.find((r) => r.venue_id === p.venue_id)?.venues?.name ?? "Venue"} · {PLAN_LABEL[p.plan]}</span>
                <span className="tabular">₹{(p.amount_paise / 100).toLocaleString("en-IN")} · {p.status}{p.paid_at ? ` · ${new Date(p.paid_at).toLocaleDateString("en-IN")}` : ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function PricingCard() {
  const [f, setF] = useState<{ season_price_inr: number; per_reward_price_inr: number; season_ends_on: string; signup_open: boolean } | null>(null);
  const s = useStatus();
  useEffect(() => {
    supabase()
      .from("app_settings")
      .select("season_price_inr, per_reward_price_inr, season_ends_on, signup_open")
      .maybeSingle()
      .then(({ data }) => data && setF({ ...data, season_ends_on: data.season_ends_on ?? "" }));
  }, []);
  if (!f) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase()
      .from("app_settings")
      .update({ season_price_inr: f!.season_price_inr, per_reward_price_inr: f!.per_reward_price_inr, season_ends_on: f!.season_ends_on || null, signup_open: f!.signup_open, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) return s.fail(error);
    s.ok("Pricing saved.");
  }
  return (
    <Card title="Venue pricing">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label>Season pass (₹, plus GST)<input type="number" min={0} value={f.season_price_inr} onChange={(e) => setF({ ...f, season_price_inr: Number(e.target.value) })} /></label>
          <label>Per redeemed reward (₹)<input type="number" min={0} value={f.per_reward_price_inr} onChange={(e) => setF({ ...f, per_reward_price_inr: Number(e.target.value) })} /></label>
        </div>
        <label>Season pass valid until<input type="date" value={f.season_ends_on} onChange={(e) => setF({ ...f, season_ends_on: e.target.value })} /></label>
        <p className="text-xs text-[#5b6865]">Leave empty and a season pass lasts 90 days from payment.</p>
        <label className="!flex items-center gap-2">
          <input type="checkbox" className="!w-auto" checked={f.signup_open} onChange={(e) => setF({ ...f, signup_open: e.target.checked })} />
          Venues can sign up themselves at /partner
        </label>
        <button className="btn btn-dark">Save pricing</button>
        {s.node}
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------- AI helpers
export function useAiEnabled() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setOn(Boolean(d.enabled)))
      .catch(() => setOn(false));
  }, []);
  return on;
}

export async function staffPost(path: string, body: unknown) {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

type PackDraft = { prompt: string; options: string[]; points: number; answer_window_s: number; ok?: boolean; problem?: string; keep: boolean };

function AiPackWriter({ onSaved }: { onSaved: () => void }) {
  const ai = useAiEnabled();
  const [f, setF] = useState({ title: "", sport: "cricket", context: "", count: 12, pack: "" });
  const [items, setItems] = useState<PackDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const s = useStatus();

  async function write(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setItems([]);
    const { ok, body } = await staffPost("/api/ai/pack", f);
    setBusy(false);
    if (!ok) return s.fail(String(body.error ?? "Couldn't write the pack."));
    const list = (body.items as Omit<PackDraft, "keep">[]) ?? [];
    setItems(list.map((x) => ({ ...x, keep: Boolean(x.ok) })));
    s.ok(`${list.filter((x) => x.ok).length} of ${list.length} passed the review. Untick any you don't want.`);
  }

  async function save() {
    const keep = items.filter((x) => x.keep);
    const pack = f.pack.trim() || `${f.title.trim()} (AI)`.slice(0, 40);
    const { error } = await supabase()
      .from("question_templates")
      .insert(keep.map((x, i) => ({ pack, sport: f.sport, prompt: x.prompt, options: x.options, points: x.points, answer_window_s: x.answer_window_s, sort_order: i + 1 })));
    if (error) return s.fail(error);
    s.ok(`Saved ${keep.length} questions to the pack “${pack}”. Pick it in the Live tab.`);
    setItems([]);
    onSaved();
  }

  return (
    <Card title="Write a pack with AI">
      {ai === false ? (
        <p className="text-sm text-[#5b6865]">AI is off. Add ANTHROPIC_API_KEY in Vercel (Settings, Environment Variables) and redeploy to switch it on.</p>
      ) : (
        <>
          <form onSubmit={write} className="grid gap-3 md:grid-cols-[1.2fr_120px_1.5fr_100px_auto] md:items-end">
            <label>Match<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Mumbai vs Chennai" /></label>
            <label>Sport
              <select value={f.sport} onChange={(e) => setF({ ...f, sport: e.target.value })}><option value="cricket">Cricket</option><option value="football">Football</option></select>
            </label>
            <label>Notes (optional)<input value={f.context} onChange={(e) => setF({ ...f, context: e.target.value })} placeholder="Final at Wankhede, Mumbai batting first" /></label>
            <label>How many
              <select value={f.count} onChange={(e) => setF({ ...f, count: Number(e.target.value) })}>{[8, 12, 20, 30].map((n) => <option key={n}>{n}</option>)}</select>
            </label>
            <button className="btn btn-dark" disabled={busy}>{busy ? "Writing and reviewing…" : "Write questions"}</button>
          </form>
          <p className="mt-2 text-xs text-[#5b6865]">A second AI pass checks every question can be settled cleanly from the broadcast. You choose what to keep.</p>
          {s.node}
          {items.length > 0 && (
            <div className="mt-3">
              <ul className="flex flex-col divide-y divide-[#eef1ef] rounded-lg border border-[#eef1ef]">
                {items.map((x, i) => (
                  <li key={i} className={`flex items-start gap-3 px-3 py-2 text-sm ${x.ok ? "" : "bg-amber-50"}`}>
                    <input type="checkbox" className="!mt-1 !w-auto" checked={x.keep} aria-label={`Keep ${x.prompt}`} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, keep: e.target.checked } : y)))} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{x.prompt}</span>
                      <span className="block text-[#5b6865]">{x.options.join(" / ")} · {x.points} pts · {x.answer_window_s}s</span>
                      {!x.ok && <span className="block text-amber-900">Review: {x.problem || "flagged"}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="!w-72">Save as pack<input value={f.pack} onChange={(e) => setF({ ...f, pack: e.target.value })} placeholder={`${f.title || "Match"} (AI)`} maxLength={40} /></label>
                <button className="btn btn-go" onClick={save} disabled={!items.some((x) => x.keep)}>Save {items.filter((x) => x.keep).length} to pack</button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- trivia (rooms)
type BankStat = { category_id: string; name: string; verified: number; pending: number; rejected: number; pulled: number; reported: number; plays: number; expiring: number };
type TCat = { id: string; slug: string; name: string; emoji: string | null; kind: string; description: string | null; sponsor_id: string | null; is_active: boolean; sort_order: number };
type TQ = { id: string; prompt: string; options: string[]; correct_option: number; explanation: string | null; source_url: string | null; source_title: string | null; status: string; origin: string; reports: number; topic: string | null; checks: { rules?: string[]; check?: string } | null; created_at: string; category_id: string | null };
type Job = { kind: string; requested: number; generated: number; passed: number; input_tokens: number; output_tokens: number; searches: number; error: string | null; created_at: string };

export function TriviaPanel({ isAdmin }: { isAdmin: boolean }) {
  const ai = useAiEnabled();
  const [stats, setStats] = useState<BankStat[]>([]);
  const [cats, setCats] = useState<TCat[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [queue, setQueue] = useState<TQ[]>([]);
  const [filter, setFilter] = useState<"reported" | "rejected" | "pulled" | "recent">("reported");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [gen, setGen] = useState({ categoryId: "", topic: "", count: 10 });
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", emoji: "", kind: "general", description: "" });
  const s = useStatus();

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: st }, { data: c }, { data: sp }, { data: j }] = await Promise.all([
      sb.rpc("trivia_bank_stats"),
      sb.from("trivia_categories").select("*").order("sort_order"),
      sb.from("sponsors").select("*").eq("is_active", true).order("name"),
      sb.from("ai_jobs").select("*").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).order("created_at", { ascending: false }).limit(200),
    ]);
    setStats((st as BankStat[]) ?? []);
    setCats((c as TCat[]) ?? []);
    setSponsors((sp as Sponsor[]) ?? []);
    setJobs((j as Job[]) ?? []);
  }, []);
  const loadQueue = useCallback(async () => {
    let q = supabase().from("trivia_questions").select("*").order("created_at", { ascending: false }).limit(60);
    if (filter === "reported") q = q.gt("reports", 0).eq("status", "verified");
    else if (filter === "recent") q = q.eq("status", "verified");
    else q = q.eq("status", filter);
    const { data } = await q;
    setQueue((data as TQ[]) ?? []);
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, body } = await staffPost("/api/trivia/generate", { categoryId: gen.categoryId || undefined, topic: gen.categoryId ? undefined : gen.topic, count: gen.count });
    setBusy(false);
    if (!ok) return s.fail(String(body.error ?? "Couldn't generate."));
    s.ok(`${body.passed} of ${body.generated} questions passed every check and are live. The rest are under Rejected.`);
    load();
    loadQueue();
  }

  async function setQ(q: TQ, patch: Partial<TQ>, msg: string) {
    const { error } = await supabase().from("trivia_questions").update(patch).eq("id", q.id);
    if (error) return s.fail(error);
    s.ok(msg);
    loadQueue();
    load();
  }

  async function saveCat(c: TCat, patch: Partial<TCat>) {
    const { error } = await supabase().from("trivia_categories").update(patch).eq("id", c.id);
    if (error) return s.fail(error);
    load();
  }

  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    const slug = newCat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const { error } = await supabase().from("trivia_categories").insert({ ...newCat, slug, emoji: newCat.emoji || null, description: newCat.description || null, sort_order: cats.length + 1 });
    if (error) return s.fail(error.message.includes("slug") ? "That category already exists." : error);
    setNewCat({ name: "", emoji: "", kind: "general", description: "" });
    s.ok("Category added. Generate some questions for it below.");
    load();
  }

  const stat = (id: string) => stats.find((x) => x.category_id === id);
  const totals = jobs.reduce(
    (a, j) => ({ gen: a.gen + j.generated, pass: a.pass + j.passed, inTok: a.inTok + j.input_tokens, outTok: a.outTok + j.output_tokens, searches: a.searches + j.searches, errors: a.errors + (j.error ? 1 : 0) }),
    { gen: 0, pass: 0, inTok: 0, outTok: 0, searches: 0, errors: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      {s.node}
      <Card title="Question bank" aside={<span className="text-sm text-[#5b6865]">{ai === false ? "AI is off: rooms use the checked bank only" : ai ? "AI on: the bank refills every night at 2 am" : ""}</span>}>
        <table className="w-full text-sm">
          <thead className="text-left text-[#5b6865]">
            <tr><th className="py-1">Category</th><th>Live questions</th><th>Reported</th><th>Rejected</th><th>Plays</th><th>Sponsor</th><th></th></tr>
          </thead>
          <tbody>
            {cats.map((c) => {
              const x = stat(c.id);
              return (
                <tr key={c.id} className={`tabular border-t border-[#eef1ef] ${c.is_active ? "" : "opacity-50"}`}>
                  <td className="py-2 font-semibold">{c.emoji} {c.name} <span className="font-normal text-[#5b6865]">{c.kind}</span></td>
                  <td className={(x?.verified ?? 0) < 20 ? "font-semibold text-amber-800" : ""}>{x?.verified ?? 0}{(x?.expiring ?? 0) > 0 ? ` (${x?.expiring} expiring)` : ""}</td>
                  <td>{x?.reported ?? 0}</td>
                  <td>{x?.rejected ?? 0}</td>
                  <td>{x?.plays ?? 0}</td>
                  <td>
                    <select className="!w-40 !py-1" value={c.sponsor_id ?? ""} onChange={(e) => saveCat(c, { sponsor_id: e.target.value || null })} aria-label={`Sponsor for ${c.name}`}>
                      <option value="">No sponsor</option>
                      {sponsors.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                    </select>
                  </td>
                  <td className="text-right"><button className="btn btn-line !py-1" onClick={() => saveCat(c, { is_active: !c.is_active })}>{c.is_active ? "Hide" : "Show"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[#5b6865]">A sponsored category shows &quot;This round is brought to you by…&quot; on every question in it. Fewer than 20 live questions is marked: generate more.</p>
        <form onSubmit={addCat} className="mt-4 grid gap-2 md:grid-cols-[1fr_80px_140px_1.5fr_auto] md:items-end">
          <label>New category<input required value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="Kabaddi" /></label>
          <label>Emoji<input value={newCat.emoji} onChange={(e) => setNewCat({ ...newCat, emoji: e.target.value })} maxLength={4} /></label>
          <label>Type
            <select value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value })}>
              <option value="sports">Sports</option><option value="bollywood">Bollywood</option><option value="current">Current affairs (needs sources)</option><option value="general">General</option>
            </select>
          </label>
          <label>Short description<input value={newCat.description} onChange={(e) => setNewCat({ ...newCat, description: e.target.value })} /></label>
          <button className="btn btn-dark">Add</button>
        </form>
      </Card>

      <Card title="Write and fact-check questions now">
        {ai === false ? (
          <p className="text-sm text-[#5b6865]">AI is off. Add ANTHROPIC_API_KEY in Vercel and redeploy to switch it on.</p>
        ) : (
          <form onSubmit={generate} className="grid gap-3 md:grid-cols-[1fr_1fr_100px_auto] md:items-end">
            <label>Category
              <select value={gen.categoryId} onChange={(e) => setGen({ ...gen, categoryId: e.target.value })}>
                <option value="">None: use the topic</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Or a topic<input disabled={Boolean(gen.categoryId)} value={gen.topic} onChange={(e) => setGen({ ...gen, topic: e.target.value })} placeholder="IPL 2026 season" /></label>
            <label>How many<select value={gen.count} onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })}>{[5, 10, 15, 20].map((n) => <option key={n}>{n}</option>)}</select></label>
            <button className="btn btn-dark" disabled={busy}>{busy ? "Writing and checking…" : "Generate"}</button>
          </form>
        )}
        <p className="mt-2 text-xs text-[#5b6865]">Every question passes rule checks and a blind second check by a different AI model. Current affairs questions also need a news source from that day&apos;s search, and retire after 10 days.</p>
      </Card>

      <Card
        title="Review queue"
        aside={
          <select className="!w-48" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="reported">Reported by players</option>
            <option value="rejected">Rejected by the checks</option>
            <option value="pulled">Pulled (2+ reports)</option>
            <option value="recent">Recently added (live)</option>
          </select>
        }
      >
        <ul className="flex flex-col gap-3">
          {queue.map((q) => (
            <li key={q.id} className="rounded-lg border border-[#eef1ef] p-3 text-sm">
              <p className="font-semibold">{q.prompt}</p>
              <ol className="mt-1 grid gap-1 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <li key={i}>
                    <button
                      className={`w-full rounded px-2 py-1 text-left ${i === q.correct_option ? "bg-emerald-100 font-semibold text-emerald-900" : "bg-[#f6f8f7]"}`}
                      title="Make this the correct answer"
                      onClick={() => i !== q.correct_option && confirm(`Change the answer to “${o}”?`) && setQ(q, { correct_option: i }, "Answer changed.")}
                    >
                      {i === q.correct_option ? "✓ " : ""}{o}
                    </button>
                  </li>
                ))}
              </ol>
              {q.explanation && <p className="mt-1 text-[#3b4745]">{q.explanation}</p>}
              <p className="mt-1 text-xs text-[#5b6865]">
                {q.origin === "ai" ? "AI" : q.origin}{q.topic ? ` · topic “${q.topic}”` : ""} · {q.reports} reports
                {q.checks?.check ? ` · check: ${q.checks.check}` : ""}{q.checks?.rules?.length ? ` · rules: ${q.checks.rules.join(", ")}` : ""}
                {q.source_url && <> · <a className="underline" href={q.source_url} target="_blank" rel="noopener">{q.source_title || "source"}</a></>}
              </p>
              <div className="mt-2 flex gap-2">
                {q.status !== "verified" && <button className="btn btn-go !py-1" onClick={() => setQ(q, { status: "verified", reports: 0 }, "Approved and live.")}>Approve</button>}
                {q.status === "verified" && q.reports > 0 && <button className="btn btn-line !py-1" onClick={() => setQ(q, { reports: 0 }, "Reports cleared.")}>It&apos;s correct, clear reports</button>}
                {q.status !== "pulled" && q.status !== "rejected" && <button className="btn btn-line !py-1" onClick={() => setQ(q, { status: "pulled" }, "Pulled from play.")}>Pull</button>}
              </div>
            </li>
          ))}
          {queue.length === 0 && <li className="py-6 text-center text-[#5b6865]">Nothing here.</li>}
        </ul>
      </Card>

      {isAdmin && (
        <Card title="AI usage, last 7 days">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <p><span className="block text-[#5b6865]">Questions written</span><span className="text-xl font-bold">{totals.gen}</span></p>
            <p><span className="block text-[#5b6865]">Passed checks</span><span className="text-xl font-bold">{totals.pass}{totals.gen ? ` (${Math.round((totals.pass / totals.gen) * 100)}%)` : ""}</span></p>
            <p><span className="block text-[#5b6865]">Tokens in / out</span><span className="text-xl font-bold">{(totals.inTok / 1000).toFixed(0)}k / {(totals.outTok / 1000).toFixed(0)}k</span></p>
            <p><span className="block text-[#5b6865]">Web searches</span><span className="text-xl font-bold">{totals.searches}</span></p>
            <p><span className="block text-[#5b6865]">Failed runs</span><span className="text-xl font-bold">{totals.errors}</span></p>
          </div>
          <p className="mt-2 text-xs text-[#5b6865]">Exact charges are on your Anthropic console (console.anthropic.com, Usage). Players are limited to 6 custom-topic rooms a day.</p>
        </Card>
      )}
    </div>
  );
}
