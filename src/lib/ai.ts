import "server-only";

// Question writing and fact-checking with the Claude API.
// Writer and checker are separate calls (by default separate models), and the
// checker never sees the intended answer: it has to arrive at it on its own.
// check-copy:allow (this file names restricted words in order to block them)

const API = "https://api.anthropic.com/v1/messages";
const GEN_MODEL = process.env.AI_GEN_MODEL || "claude-sonnet-5-5";
const CHECK_MODEL = process.env.AI_CHECK_MODEL || "claude-opus-5-5";
const MOCK = !process.env.ANTHROPIC_API_KEY && process.env.AI_MOCK === "1";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) || MOCK;

export type Usage = { input: number; output: number; searches: number };
const addUsage = (u: Usage, r: { usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } } }) => {
  u.input += r.usage?.input_tokens ?? 0;
  u.output += r.usage?.output_tokens ?? 0;
  u.searches += r.usage?.server_tool_use?.web_search_requests ?? 0;
};

type Block =
  | { type: "text"; text: string; citations?: { url?: string; title?: string }[] }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "server_tool_use"; id: string; name: string; input: unknown }
  | { type: "web_search_tool_result"; tool_use_id: string; content: { type?: string; url?: string; title?: string; page_age?: string }[] | { type: string; error_code: string } };
type Msg = { role: "user" | "assistant"; content: string | Block[] };
type Resp = { content: Block[]; stop_reason: string; usage?: Usage & Record<string, unknown> };

async function call(body: Record<string, unknown>): Promise<Resp> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/**
 * Runs a conversation until Claude calls the named client tool. Handles web
 * search (a server tool) pausing, and nudges once if Claude answers in text.
 */
async function untilTool<T>(opts: {
  model: string;
  system: string;
  user: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  search?: { max_uses: number };
  usage: Usage;
  maxTokens?: number;
}): Promise<{ input: T; searchedUrls: Set<string> }> {
  const tools: Record<string, unknown>[] = [opts.tool];
  if (opts.search)
    tools.push({ type: "web_search_20250305", name: "web_search", max_uses: opts.search.max_uses, user_location: { type: "approximate", country: "IN", timezone: "Asia/Kolkata" } });
  const messages: Msg[] = [{ role: "user", content: opts.user }];
  const searchedUrls = new Set<string>();
  let nudged = false;
  for (let turn = 0; turn < 6; turn++) {
    const r = await call({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      tools,
      // With search on, Claude must be free to search first; otherwise force the tool.
      tool_choice: opts.search ? { type: "auto" } : { type: "tool", name: opts.tool.name },
      messages,
    });
    addUsage(opts.usage, r as never);
    for (const b of r.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content))
        for (const x of b.content) if (x.url) searchedUrls.add(x.url);
      if (b.type === "text") for (const c of b.citations ?? []) if (c.url) searchedUrls.add(c.url);
    }
    const hit = r.content.find((b) => b.type === "tool_use" && b.name === opts.tool.name) as { input: T } | undefined;
    if (hit) return { input: hit.input, searchedUrls };
    messages.push({ role: "assistant", content: r.content });
    if (r.stop_reason === "pause_turn") continue; // long search: let it carry on
    if (nudged) break;
    nudged = true;
    messages.push({ role: "user", content: `Now call ${opts.tool.name} with your final result.` });
  }
  throw new Error("The AI didn't return a result.");
}

// ---------------------------------------------------------------- rules
const BLOCK_TERMS = [
  /\b(bet|bets|betting|wager\w*|gambl\w*|casino|odds|satta)\b/i,
  /\b(sex\w*|porn\w*|nude|nudity|rape|molest\w*|suicide|self-harm|terror\w*|bomb\w*|murder\w*|massacre)\b/i,
  /\b(caste|religion|religious|hindu|muslim|christian|sikh|jain|islam|temple|mosque|church)\b/i,
  /\b(bjp|congress party|aap|tmc|election\w*|voting|voter\w*|lok sabha|rajya sabha|vidhan sabha)\b/i,
  /\b(drunk|alcohol\w*|beer|whisky|vodka|liquor)\b/i,
];

export function topicAllowed(topic: string) {
  const t = topic.trim();
  if (t.length < 3 || t.length > 60) return false;
  return !BLOCK_TERMS.some((re) => re.test(t));
}

export type Draft = {
  prompt: string;
  options: string[];
  answer_index: number;
  explanation: string;
  difficulty?: number;
  source_url?: string | null;
  source_title?: string | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const fingerprint = (prompt: string) => norm(prompt);

/** Problems a draft has before any AI check. Empty = passes the rules. */
export function ruleProblems(d: Draft, current: boolean, searched: Set<string>): string[] {
  const p: string[] = [];
  if (!d || typeof d.prompt !== "string") return ["missing question"];
  const prompt = d.prompt.trim();
  if (prompt.length < 12 || prompt.length > 200) p.push("question length");
  if (!prompt.endsWith("?")) p.push("not a question");
  if (!Array.isArray(d.options) || d.options.length !== 4) p.push("needs exactly 4 options");
  const opts = (d.options ?? []).map((o) => String(o ?? "").trim());
  if (opts.some((o) => !o || o.length > 60)) p.push("option length");
  if (new Set(opts.map(norm)).size !== opts.length) p.push("duplicate options");
  if (!Number.isInteger(d.answer_index) || d.answer_index < 0 || d.answer_index >= opts.length) p.push("answer index");
  const answer = opts[d.answer_index] ?? "";
  if (answer.length > 3 && norm(prompt).includes(norm(answer))) p.push("answer given away in the question");
  const all = [prompt, ...opts, d.explanation ?? ""].join(" ");
  if (BLOCK_TERMS.some((re) => re.test(all))) p.push("blocked subject");
  if (/\b(all|none|both) of the above\b/i.test(all)) p.push("of-the-above option");
  if (/\bNOT\b/.test(prompt)) p.push("negative question");
  if (!d.explanation || d.explanation.length < 8) p.push("no explanation");
  if (current) {
    if (!d.source_url || !/^https:\/\//.test(d.source_url)) p.push("no source");
    else if (!searched.has(d.source_url)) p.push("source not from today's search");
    if (!/\b(20\d\d)\b/.test(prompt)) p.push("current affairs question without a date");
  }
  return p;
}

// ---------------------------------------------------------------- writing
const WRITER_SYSTEM = `You write multiple-choice trivia questions for SportsAura, a free quiz game for adults in India, played with friends at sports bars and at home. Accuracy matters more than anything: a wrong answer key ruins the game for everyone.

Rules for every question:
- Exactly 4 options. One is clearly and verifiably correct; the other three are plausible wrong answers of the same type (all years, all players, all films).
- Use only facts that are well documented and not disputed. If you are not certain, leave that question out.
- No answers that change over time (records that may be broken, "current" holders) unless the question states the date, e.g. "As of October 2026".
- No trick questions, no "all/none of the above", no negatives like "Which is NOT".
- Don't put the answer's words in the question.
- No song lyrics. Short famous film dialogues are fine.
- No religion, caste, party politics, elections, sexual content, violence or tragedies, alcohol, gambling, or anyone's health or private life. Nothing that mocks a person or a group.
- Questions under 160 characters, options under 50 characters, written in simple English.
- Explanation: one short sentence saying why the answer is right.
- Mix difficulty: 1 easy, 2 medium, 3 hard.
Think like an Indian audience: Bollywood means Hindi cinema (plus big pan-India hits); sports includes cricket, football, Olympics, tennis, kabaddi, badminton and F1.`;

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    refused: { type: "boolean", description: "true if the topic is not suitable for a fun, respectful quiz" },
    refusal_reason: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          answer_index: { type: "integer", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
          difficulty: { type: "integer", minimum: 1, maximum: 3 },
          source_url: { type: "string" },
          source_title: { type: "string" },
        },
        required: ["prompt", "options", "answer_index", "explanation", "difficulty"],
      },
    },
  },
  required: ["refused", "questions"],
};

export async function writeQuestions(opts: {
  category: string;
  kind: "sports" | "bollywood" | "current" | "general";
  topic?: string | null;
  count: number;
  avoid?: string[];
  usage: Usage;
}): Promise<{ drafts: Draft[]; refused: boolean; reason?: string; searched: Set<string> }> {
  if (MOCK) return mockWrite(opts);
  const current = opts.kind === "current";
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const subject = opts.topic ? `the topic "${opts.topic}" (chosen by a player; refuse it if it breaks the rules)` : `the category "${opts.category}"`;
  const user = [
    `Today is ${today}. Write ${opts.count} questions about ${subject}.`,
    current
      ? "These are current affairs questions. Use web search to find news from the last 7 days from reputable outlets (for example The Hindu, Indian Express, Hindustan Times, Times of India, NDTV, Mint, ESPNcricinfo, Reuters, BBC). Each question must be based on a specific article you found: put its exact URL in source_url and the publication in source_title, and include the month and year in the question. Skip party politics and elections."
      : "Prefer facts that are stable over time.",
    opts.avoid?.length ? `Don't repeat these existing questions:\n${opts.avoid.slice(0, 40).map((a) => `- ${a}`).join("\n")}` : "",
    "Call submit_questions with the result.",
  ].filter(Boolean).join("\n\n");

  const { input, searchedUrls } = await untilTool<{ refused: boolean; refusal_reason?: string; questions: Draft[] }>({
    model: GEN_MODEL,
    system: WRITER_SYSTEM,
    user,
    tool: { name: "submit_questions", description: "Submit the finished trivia questions.", input_schema: QUESTION_SCHEMA },
    search: current ? { max_uses: 6 } : undefined,
    usage: opts.usage,
    maxTokens: 8000,
  });
  return { drafts: input.questions ?? [], refused: Boolean(input.refused), reason: input.refusal_reason, searched: searchedUrls };
}

// ---------------------------------------------------------------- checking
const CHECK_SYSTEM = `You are a strict fact-checker for a quiz game. You see a question and four options, but not the intended answer. Work out which option is correct from your own knowledge (and web search when it is offered). Be honest: if you are not sure, say so with a low confidence. Flag questions that are ambiguous (more than one option could be right, or the wording is unclear), time-sensitive (the answer may have changed or will change), or unsuitable (religion, caste, party politics, sexual content, violence, alcohol, gambling, lyrics, private life, mocking anyone).`;

const CHECK_SCHEMA = {
  type: "object",
  properties: {
    choice_index: { type: "integer", minimum: -1, maximum: 3, description: "the correct option, or -1 if none is correct" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    ambiguous: { type: "boolean" },
    time_sensitive: { type: "boolean" },
    unsuitable: { type: "boolean" },
    notes: { type: "string" },
  },
  required: ["choice_index", "confidence", "ambiguous", "time_sensitive", "unsuitable"],
};

export type CheckResult = { ok: boolean; reason: string; detail: Record<string, unknown> };

export async function checkQuestion(d: Draft, current: boolean, usage: Usage): Promise<CheckResult> {
  // Shuffle so the checker can't lean on the writer's option order.
  const order = d.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  const shown = order.map((i) => d.options[i]);
  const expected = order.indexOf(d.answer_index);
  let r: { choice_index: number; confidence: number; ambiguous: boolean; time_sensitive: boolean; unsuitable: boolean; notes?: string };
  if (MOCK) r = mockCheck(d, shown);
  else {
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    const user = [
      `Today is ${today}.`,
      `Question: ${d.prompt}`,
      shown.map((o, i) => `${i}. ${o}`).join("\n"),
      current && d.source_url ? `The writer cited this source: ${d.source_url}. Check it, and other reputable reporting, with web search.` : "",
      "Call answer_check with your verdict.",
    ].filter(Boolean).join("\n\n");
    r = (await untilTool<typeof r>({
      model: CHECK_MODEL,
      system: CHECK_SYSTEM,
      user,
      tool: { name: "answer_check", description: "Report which option is correct and any problems.", input_schema: CHECK_SCHEMA },
      search: current ? { max_uses: 3 } : undefined,
      usage,
      maxTokens: 1500,
    })).input;
  }
  const detail = { ...r, expected, model: MOCK ? "mock" : CHECK_MODEL };
  if (r.unsuitable) return { ok: false, reason: "checker: unsuitable", detail };
  if (r.ambiguous) return { ok: false, reason: "checker: ambiguous", detail };
  if (r.time_sensitive && !current) return { ok: false, reason: "checker: time-sensitive", detail };
  if (r.choice_index !== expected) return { ok: false, reason: "checker picked a different answer", detail };
  if (r.confidence < 0.85) return { ok: false, reason: "checker not confident", detail };
  return { ok: true, reason: "passed", detail };
}

// ---------------------------------------------------------------- bar packs
export type PackItem = { prompt: string; options: string[]; points: number; answer_window_s: number; ok?: boolean; problem?: string };

export async function writePack(opts: { title: string; sport: string; context: string; count: number; usage: Usage }): Promise<PackItem[]> {
  if (MOCK)
    return Array.from({ length: opts.count }, (_, i) => ({
      prompt: `Mock ${opts.sport} question ${i + 1}: will the next over go for 10+ runs?`,
      options: ["Yes", "No"],
      points: 20,
      answer_window_s: 30,
      ok: i !== 1,
      problem: i === 1 ? "mock: can't be settled quickly" : undefined,
    }));
  const system = `You write live prediction questions for a free game played in sports bars in India during a match. A game host pushes each question and settles it by watching the broadcast.
Rules:
- Each question must be settled by what happens in this match, ideally within the next few minutes (this over, next 10 minutes) or clearly by the end of the match.
- Options must be mutually exclusive and cover every outcome (use "No" / "Other" / "None" where needed). 2 to 5 options.
- No questions about injuries, health, umpiring controversies, crowd trouble or anything off the field.
- No gambling words or odds. Keep it fun and simple.
- Questions under 100 characters. Points 10 to 50 (harder = more). Answer window 15 to 60 seconds.
- Use {over} where the current over number belongs (cricket), and {home} / {away} for the two teams if useful.`;
  const { input } = await untilTool<{ questions: PackItem[] }>({
    model: GEN_MODEL,
    system,
    user: `Match: ${opts.title} (${opts.sport}). Notes from the host: ${opts.context || "none"}.\nWrite ${opts.count} questions and call submit_pack.`,
    tool: {
      name: "submit_pack",
      description: "Submit the prediction questions.",
      input_schema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                prompt: { type: "string" },
                options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
                points: { type: "integer", minimum: 10, maximum: 50 },
                answer_window_s: { type: "integer", minimum: 15, maximum: 60 },
              },
              required: ["prompt", "options", "points", "answer_window_s"],
            },
          },
        },
        required: ["questions"],
      },
    },
    usage: opts.usage,
    maxTokens: 6000,
  });
  const items = (input.questions ?? []).slice(0, opts.count);
  if (!items.length) return [];
  // Second opinion: can each be settled cleanly from the broadcast?
  const { input: rev } = await untilTool<{ reviews: { index: number; ok: boolean; problem?: string }[] }>({
    model: CHECK_MODEL,
    system: "You review live prediction questions for a sports bar game. A question is OK only if a host watching the broadcast can settle it with no doubt, the options don't overlap and they cover every outcome, and it avoids injuries, health, controversies and gambling words.",
    user: items.map((q, i) => `${i}. ${q.prompt} [${q.options.join(" | ")}]`).join("\n") + "\n\nCall review_pack with one review per question.",
    tool: {
      name: "review_pack",
      description: "Review each question.",
      input_schema: {
        type: "object",
        properties: { reviews: { type: "array", items: { type: "object", properties: { index: { type: "integer" }, ok: { type: "boolean" }, problem: { type: "string" } }, required: ["index", "ok"] } } },
        required: ["reviews"],
      },
    },
    usage: opts.usage,
    maxTokens: 3000,
  });
  return items.map((q, i) => {
    const r = rev.reviews?.find((x) => x.index === i);
    const blocked = BLOCK_TERMS.slice(0, 2).some((re) => re.test([q.prompt, ...q.options].join(" ")));
    return { ...q, ok: Boolean(r?.ok) && !blocked, problem: blocked ? "blocked words" : r?.problem };
  });
}

// ---------------------------------------------------------------- mock (local tests only)
function mockWrite(opts: { category: string; topic?: string | null; count: number; kind: string }) {
  const searched = new Set<string>(["https://example.com/news"]);
  const drafts: Draft[] = Array.from({ length: opts.count }, (_, i) => {
    const n = 3 + i;
    const right = String(n + n);
    // Every 5th draft carries a wrong answer key on purpose: the checker must catch it.
    const key = i % 5 === 4 ? String(n + n + 1) : right;
    const opts4 = [key, ...[right, String(n + n + 1), String(n + n + 2), String(n + n + 3)].filter((x) => x !== key).slice(0, 3)];
    return {
      prompt: `${opts.topic ?? opts.category} warm-up ${i + 1} (2026): what is ${n} + ${n}?`,
      options: opts4,
      answer_index: 0,
      explanation: `${n} plus ${n} makes ${right}.`,
      difficulty: 1,
      source_url: opts.kind === "current" ? "https://example.com/news" : null,
      source_title: opts.kind === "current" ? "Example News" : null,
    };
  });
  return Promise.resolve({ drafts, refused: !topicAllowed(opts.topic ?? "ok topic"), searched });
}

function mockCheck(d: Draft, shown: string[]) {
  const m = d.prompt.match(/what is (\d+) \+ (\d+)/);
  const sum = m ? String(Number(m[1]) + Number(m[2])) : "";
  return { choice_index: shown.indexOf(sum), confidence: 0.97, ambiguous: false, time_sensitive: false, unsuitable: false, notes: "mock" };
}
