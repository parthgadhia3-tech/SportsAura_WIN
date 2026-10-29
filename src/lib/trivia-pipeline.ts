import "server-only";
import { checkQuestion, fingerprint, ruleProblems, writeQuestions, type Usage } from "./ai";
import type { supabaseAdmin } from "./supabase-admin";

type Db = ReturnType<typeof supabaseAdmin>;
type Kind = "sports" | "bollywood" | "current" | "general";

/** Runs async jobs with a small concurrency limit. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Write -> rule check -> de-duplicate -> blind fact check -> store.
 * Only questions that pass everything are stored as "verified"; the rest are
 * kept as "rejected" with the reason, for the admin review queue.
 */
export async function produceVerified(
  db: Db,
  opts: { kind: "custom" | "daily" | "admin"; userId?: string | null; categoryId?: string | null; topic?: string | null; want: number },
): Promise<{ passed: number; generated: number; refused?: string; error?: string }> {
  const usage: Usage = { input: 0, output: 0, searches: 0 };
  let generated = 0;
  let passed = 0;
  let error: string | undefined;
  let refused: string | undefined;
  type Cat = { id: string; name: string; kind: Kind };
  const cat: Cat | null = opts.categoryId
    ? (((await db.from("trivia_categories").select("id, name, kind").eq("id", opts.categoryId).maybeSingle()).data as Cat | null) ?? null)
    : null;
  const kind: Kind = cat?.kind ?? "general";
  const topic = opts.topic ? opts.topic.trim().toLowerCase() : null;

  try {
    // Recent questions in the same place, so the writer doesn't repeat them
    const recentQ = db.from("trivia_questions").select("prompt").order("created_at", { ascending: false }).limit(40);
    const { data: recent } = topic ? await recentQ.eq("topic", topic) : await recentQ.eq("category_id", opts.categoryId ?? "");
    const ask = Math.min(opts.want + 4, 24);
    const { drafts, refused: no, reason, searched } = await writeQuestions({
      category: cat?.name ?? "General knowledge",
      kind,
      topic: opts.topic,
      count: ask,
      avoid: (recent ?? []).map((r) => r.prompt),
      usage,
    });
    if (no) {
      refused = reason || "That topic can't be used for a quiz.";
    } else {
      generated = drafts.length;
      const current = kind === "current";
      const seen = new Set<string>();
      const candidates = drafts.filter((d) => {
        const f = fingerprint(d.prompt ?? "");
        if (!f || seen.has(f)) return false;
        seen.add(f);
        return true;
      });
      const { data: existing } = await db.from("trivia_questions").select("fingerprint").in("fingerprint", [...seen]);
      const taken = new Set((existing ?? []).map((e) => e.fingerprint));

      const rows = await pool(candidates.filter((d) => !taken.has(fingerprint(d.prompt))), 4, async (d) => {
        const problems = ruleProblems(d, current, searched);
        const check = problems.length ? null : await checkQuestion(d, current, usage).catch((e) => ({ ok: false, reason: `check failed: ${e.message}`, detail: {} }));
        const ok = Boolean(check?.ok);
        return {
          category_id: cat?.id ?? null,
          topic,
          prompt: d.prompt.trim(),
          options: d.options.map((o) => String(o).trim()),
          correct_option: d.answer_index,
          explanation: d.explanation?.trim() || null,
          source_url: d.source_url && /^https:\/\//.test(d.source_url) ? d.source_url : null,
          source_title: d.source_title || null,
          difficulty: Math.min(Math.max(Number(d.difficulty) || 2, 1), 3),
          status: ok ? "verified" : "rejected",
          origin: "ai",
          checks: { rules: problems, check: check?.reason ?? "skipped (rules)", detail: check?.detail ?? null },
          fingerprint: fingerprint(d.prompt),
          // News ages fast: current affairs questions retire after 10 days.
          expires_at: current ? new Date(Date.now() + 10 * 86400000).toISOString() : null,
        };
      });
      const valid = rows.filter((r) => Number.isInteger(r.correct_option) && r.options.length >= 2 && r.correct_option < r.options.length);
      // Keep only as many verified as asked for; extras stay in the bank for next time.
      if (valid.length) {
        const { error: insErr } = await db.from("trivia_questions").upsert(valid, { onConflict: "fingerprint", ignoreDuplicates: true });
        if (insErr) error = insErr.message;
      }
      passed = valid.filter((r) => r.status === "verified").length;
    }
  } catch (e) {
    error = (e as Error).message;
  }

  await db.from("ai_jobs").insert({
    kind: opts.kind,
    user_id: opts.userId ?? null,
    topic,
    category_id: cat?.id ?? null,
    requested: opts.want,
    generated,
    passed,
    input_tokens: usage.input,
    output_tokens: usage.output,
    searches: usage.searches,
    error: error ?? refused ?? null,
  });
  return { passed, generated, refused, error };
}
