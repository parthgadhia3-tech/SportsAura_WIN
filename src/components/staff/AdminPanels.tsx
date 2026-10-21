"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import { DEFAULT_THEME, themeVars } from "@/lib/theme";
import type { Banner, Bucket, BgType, CodeMode, Match, RewardRule, RewardSet, Theme, Venue } from "@/lib/types";

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
      <Card title="Where these appear">
        <ul className="list-disc space-y-2 pl-5 text-sm text-[#3b4745]">
          <li>The <strong>Terms</strong> and <strong>Privacy</strong> links at the bottom of the sign-in screen, the setup screen and the game screen open your links if set, otherwise the built-in pages.</li>
          <li>Built-in pages: <a className="underline" href="/terms" target="_blank">/terms</a> and <a className="underline" href="/privacy" target="_blank">/privacy</a>. They fill in the company and grievance details above automatically.</li>
          <li>Every change here is recorded in the Audit tab.</li>
        </ul>
      </Card>
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
