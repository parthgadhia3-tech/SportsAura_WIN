import { aiEnabled, writePack, type Usage } from "@/lib/ai";
import { staffCaller } from "@/lib/server-auth";

export const maxDuration = 120;

/** Game host: draft a match-specific prediction pack, reviewed by a second AI pass. */
export async function POST(request: Request) {
  const c = await staffCaller(request);
  if (c instanceof Response) return c;
  if (c.role === "venue_manager") return Response.json({ error: "Only the game team can do this." }, { status: 403 });
  if (!aiEnabled()) return Response.json({ error: "Add ANTHROPIC_API_KEY in Vercel to switch on AI." }, { status: 503 });
  const b = (await request.json().catch(() => null)) as { title?: string; sport?: string; context?: string; count?: number } | null;
  if (!b?.title?.trim()) return Response.json({ error: "Type the match, for example Mumbai vs Chennai." }, { status: 400 });
  const usage: Usage = { input: 0, output: 0, searches: 0 };
  try {
    const items = await writePack({
      title: b.title.trim().slice(0, 80),
      sport: b.sport === "football" ? "football" : "cricket",
      context: (b.context ?? "").slice(0, 300),
      count: Math.min(Math.max(Number(b.count) || 12, 4), 30),
      usage,
    });
    await c.db.from("ai_jobs").insert({ kind: "pack", user_id: c.userId, topic: b.title.trim(), requested: b.count ?? 12, generated: items.length, passed: items.filter((i) => i.ok).length, input_tokens: usage.input, output_tokens: usage.output });
    return Response.json({ items });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
