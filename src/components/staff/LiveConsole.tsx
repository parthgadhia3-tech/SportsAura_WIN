"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/copy";
import type { Bucket, Match, Question, Venue } from "@/lib/types";

const PRESETS: { label: string; options: string[] }[] = [
  { label: "Yes / No", options: ["Yes", "No"] },
  { label: "Runs in over", options: ["0 to 5", "6 to 9", "10 to 14", "15+"] },
  { label: "Wicket type", options: ["Caught", "Bowled", "LBW", "Run out", "Other"] },
  { label: "Next ball", options: ["Dot", "1 to 3 runs", "Boundary", "Wicket"] },
];

type Counts = Record<string, number[]>;

export function LiveConsole() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // draft form
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(["Yes", "No"]);
  const [points, setPoints] = useState(10);
  const [windowS, setWindowS] = useState(30);
  const [bucketId, setBucketId] = useState("");
  const [venueScope, setVenueScope] = useState("");

  const match = matches.find((m) => m.id === matchId);
  const [rewardSet, setRewardSet] = useState<{ code: string } | null>(null);
  const [stock, setStock] = useState<{ total_left: number; unlimited: boolean } | null>(null);
  const setIdForMatch = match?.reward_set_id ?? null;

  useEffect(() => {
    if (!setIdForMatch) {
      setRewardSet(null);
      setStock(null);
      return;
    }
    const sb = supabase();
    const load = () => {
      sb.from("reward_sets").select("code").eq("id", setIdForMatch).maybeSingle().then(({ data }) => setRewardSet(data));
      sb.rpc("reward_set_stock", { p_set: setIdForMatch }).then(({ data }) =>
        setStock(((data as { total_left: number; unlimited: boolean }[]) ?? [])[0] ?? null),
      );
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [setIdForMatch]);

  const loadMeta = useCallback(async () => {
    const sb = supabase();
    const [{ data: ms }, { data: bs }, { data: vs }] = await Promise.all([
      sb.from("matches").select("*").neq("status", "ended").order("starts_at"),
      sb.from("coupon_buckets").select("*").eq("is_active", true).order("created_at", { ascending: false }),
      sb.from("venues").select("id, name, slug").eq("is_active", true).order("name"),
    ]);
    const list = (ms as Match[]) ?? [];
    setMatches(list);
    setBuckets((bs as Bucket[]) ?? []);
    setVenues((vs as Venue[]) ?? []);
    setMatchId((cur) => cur || list.find((m) => m.status === "live")?.id || list[0]?.id || "");
  }, []);

  const loadQuestions = useCallback(async () => {
    if (!matchId) return;
    const sb = supabase();
    const { data } = await sb.from("questions").select("*").eq("match_id", matchId).order("created_at", { ascending: false });
    const qs = (data as Question[]) ?? [];
    setQuestions(qs);
    const open = qs.filter((q) => q.status === "live" || q.status === "locked" || q.status === "resolved").slice(0, 8);
    if (open.length) {
      const { data: as } = await sb.from("answers").select("question_id, selected_option").in("question_id", open.map((q) => q.id));
      const c: Counts = {};
      for (const q of open) c[q.id] = q.options.map(() => 0);
      for (const a of (as as { question_id: string; selected_option: number }[]) ?? []) {
        if (c[a.question_id]) c[a.question_id][a.selected_option]++;
      }
      setCounts(c);
    }
  }, [matchId]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadQuestions();
    const t = setInterval(() => {
      loadQuestions();
    }, 3000);
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, [loadQuestions]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 2500);
  }

  async function run<T>(fn: () => PromiseLike<{ error: { message: string } | null; data?: T }>, ok?: string) {
    setError("");
    const { error } = await fn();
    if (error) {
      setError(friendlyError(error));
      return false;
    }
    if (ok) flash(ok);
    await loadQuestions();
    return true;
  }

  async function setMatchStatus(status: Match["status"]) {
    if (!match) return;
    const { error } = await supabase().from("matches").update({ status }).eq("id", match.id);
    if (error) return setError(friendlyError(error));
    flash(status === "live" ? "Match is live. Patrons can check in." : "Match ended.");
    loadMeta();
  }

  async function saveDraft(pushNow: boolean) {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (prompt.trim().length < 5 || clean.length < 2) return setError("Add a question and at least two options.");
    const { data: user } = await supabase().auth.getUser();
    const { data, error } = await supabase()
      .from("questions")
      .insert({
        match_id: matchId,
        venue_id: venueScope || null,
        prompt: prompt.trim(),
        options: clean,
        points,
        answer_window_s: windowS,
        coupon_bucket_id: bucketId || null,
        created_by: user.user?.id,
      })
      .select("id")
      .single();
    if (error) return setError(friendlyError(error));
    setPrompt("");
    if (pushNow) {
      await run(() => supabase().rpc("push_question", { p_question_id: data.id }), "Pushed to phones.");
    } else {
      flash("Draft saved.");
      loadQuestions();
    }
  }

  const live = questions.filter((q) => q.status === "live" || q.status === "locked");
  const drafts = questions.filter((q) => q.status === "draft");
  const done = questions.filter((q) => q.status === "resolved" || q.status === "void");
  const bucketName = useMemo(() => Object.fromEntries(buckets.map((b) => [b.id, b])), [buckets]);

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <section className="flex flex-col gap-4">
        <div className="rounded-xl border border-[#d8dedb] bg-white p-4">
          <label>
            Match
            <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({m.status})
                </option>
              ))}
            </select>
          </label>
          {match && (
            <div className="mt-3 flex gap-2">
              {match.status !== "live" ? (
                <button className="btn btn-go" onClick={() => setMatchStatus("live")}>Start match</button>
              ) : (
                <button className="btn btn-line" onClick={() => setMatchStatus("ended")}>End match</button>
              )}
            </div>
          )}
          {!matches.length && <p className="mt-2 text-sm text-[#5b6865]">Create a match in the Matches tab first.</p>}
        </div>

        <form
          className="flex flex-col gap-3 rounded-xl border border-[#d8dedb] bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveDraft(true);
          }}
        >
          <h2 className="text-lg font-bold">New question</h2>
          <label>
            Question
            <input value={prompt} maxLength={160} onChange={(e) => setPrompt(e.target.value)} placeholder="Will the next over go for 10+ runs?" />
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button type="button" key={p.label} className="btn btn-line !px-2 !py-1 text-xs" onClick={() => setOptions(p.options)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={o}
                  aria-label={`Option ${i + 1}`}
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {options.length > 2 && (
                  <button type="button" className="btn btn-line" aria-label="Remove option" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button type="button" className="btn btn-line self-start" onClick={() => setOptions([...options, ""])}>
                Add option
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              Points
              <input type="number" min={1} max={1000} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
            </label>
            <label>
              Answer window
              <select value={windowS} onChange={(e) => setWindowS(Number(e.target.value))}>
                {[15, 20, 30, 45, 60, 90, 120].map((s) => (
                  <option key={s} value={s}>{s} seconds</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {match?.reward_set_id ? "Bonus reward (optional, on top of the set)" : "Reward bucket"}
            <select value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
              <option value="">{match?.reward_set_id ? "No bonus" : "Points only"}</option>
              {buckets.filter((b) => !b.set_id).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.brand_name}: {b.title}
                  {b.min_age === 25 ? " (25+ spirits)" : b.is_alcohol ? " (21+ beer/wine)" : ""}
                  {b.total_quantity ? ` [${Math.max(b.total_quantity - b.issued_count, 0)} left]` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Send to
            <select value={venueScope} onChange={(e) => setVenueScope(e.target.value)}>
              <option value="">All venues</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name} only</option>
              ))}
            </select>
          </label>
          <div className="mt-1 flex gap-2">
            <button className="btn btn-go flex-1" disabled={match?.status !== "live"}>Push now</button>
            <button type="button" className="btn btn-line flex-1" onClick={() => saveDraft(false)}>Save draft</button>
          </div>
          {match?.status !== "live" && <p className="text-xs text-[#5b6865]">Start the match to push questions. Drafts can be saved any time.</p>}
        </form>
      </section>

      <section className="flex flex-col gap-5">
        {(error || notice) && (
          <p className={`rounded-lg px-4 py-2 text-sm font-medium ${error ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-900"}`} role="status">
            {error || notice}
          </p>
        )}

        <div>
          {match?.reward_set_id && (
            <p className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
              Reward set {rewardSet?.code ?? ""} is on for this match: every right answer automatically wins a coupon from it.
              {stock && !stock.unlimited ? ` ${stock.total_left} coupons left.` : ""}
            </p>
          )}
          <h2 className="mb-2 text-lg font-bold">On phones now</h2>
          {live.length === 0 && <p className="rounded-xl border border-dashed border-[#c9d0cd] p-6 text-center text-[#5b6865]">Nothing live. Push a question to start.</p>}
          <div className="flex flex-col gap-3">
            {live.map((q) => {
              const left = q.locks_at ? Math.max(0, Math.ceil((new Date(q.locks_at).getTime() - now) / 1000)) : 0;
              const c = counts[q.id] ?? q.options.map(() => 0);
              const total = c.reduce((a, b) => a + b, 0);
              const closed = q.status === "locked" || left === 0;
              return (
                <article key={q.id} className="rounded-xl border-2 border-[#0f7a5c] bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-[#0f7a5c]">
                        {closed ? "Closed, waiting for result" : `Open, ${left}s left`} · {total} answers
                        {q.coupon_bucket_id && bucketName[q.coupon_bucket_id] ? ` · Reward: ${bucketName[q.coupon_bucket_id].title}` : ""}
                      </p>
                      <h3 className="mt-1 text-xl font-bold">{q.prompt}</h3>
                    </div>
                    {!closed && (
                      <button className="btn btn-warn shrink-0" onClick={() => run(() => supabase().rpc("lock_question", { p_question_id: q.id }), "Locked.")}>
                        Lock now
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[#3b4745]">Tap the correct answer to settle it:</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {q.options.map((o, i) => (
                      <button
                        key={i}
                        className="btn btn-line !justify-between !py-3 text-left"
                        onClick={() => {
                          if (confirm(`Settle as "${o}"? Points and rewards go out immediately.`))
                            run(() => supabase().rpc("resolve_question", { p_question_id: q.id, p_correct_option: i }), `Settled: ${o}`);
                        }}
                      >
                        <span>{o}</span>
                        <span className="tabular text-[#5b6865]">
                          {c[i]} {total ? `(${Math.round((c[i] / total) * 100)}%)` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="mt-3 text-sm font-semibold text-red-700 underline"
                    onClick={() => confirm("Void this question? No points will be given.") && run(() => supabase().rpc("void_question", { p_question_id: q.id }), "Voided.")}
                  >
                    Void (can&apos;t be settled)
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-bold">Drafts</h2>
          {drafts.length === 0 && <p className="text-sm text-[#5b6865]">No drafts. Prepare a few before the match to push them in one tap.</p>}
          <ul className="flex flex-col gap-2">
            {drafts.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#d8dedb] bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{q.prompt}</p>
                  <p className="truncate text-xs text-[#5b6865]">
                    {q.options.join(" / ")} · {q.points} pts · {q.answer_window_s}s
                    {q.coupon_bucket_id && bucketName[q.coupon_bucket_id] ? ` · ${bucketName[q.coupon_bucket_id].title}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className="btn btn-go" disabled={match?.status !== "live"} onClick={() => run(() => supabase().rpc("push_question", { p_question_id: q.id }), "Pushed to phones.")}>
                    Push
                  </button>
                  <button className="btn btn-line" onClick={() => run(() => supabase().from("questions").delete().eq("id", q.id), "Draft deleted.")}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-bold">Settled</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {done.slice(0, 20).map((q) => {
              const c = counts[q.id];
              const right = q.correct_option != null && c ? c[q.correct_option] : null;
              return (
                <li key={q.id} className="flex justify-between gap-3 rounded-lg bg-white px-4 py-2">
                  <span className="truncate">{q.prompt}</span>
                  <span className="shrink-0 text-[#5b6865]">
                    {q.status === "void" ? "Void" : `${q.options[q.correct_option!]}${right != null ? ` · ${right} correct` : ""}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
