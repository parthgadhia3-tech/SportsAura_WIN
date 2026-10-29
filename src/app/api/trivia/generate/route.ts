import { aiEnabled } from "@/lib/ai";
import { staffCaller } from "@/lib/server-auth";
import { produceVerified } from "@/lib/trivia-pipeline";

export const maxDuration = 300;

/** Admin / game master: write and fact-check questions for a category or topic now. */
export async function POST(request: Request) {
  const c = await staffCaller(request);
  if (c instanceof Response) return c;
  if (c.role === "venue_manager") return Response.json({ error: "Only the game team can do this." }, { status: 403 });
  if (!aiEnabled()) return Response.json({ error: "Add ANTHROPIC_API_KEY in Vercel to switch on AI." }, { status: 503 });
  const b = (await request.json().catch(() => null)) as { categoryId?: string; topic?: string; count?: number } | null;
  if (!b?.categoryId && !b?.topic?.trim()) return Response.json({ error: "Pick a category or type a topic." }, { status: 400 });
  const r = await produceVerified(c.db, {
    kind: "admin",
    userId: c.userId,
    categoryId: b.categoryId || null,
    topic: b.categoryId ? null : b.topic,
    want: Math.min(Math.max(Number(b.count) || 10, 3), 20),
  });
  if (r.refused) return Response.json({ error: r.refused }, { status: 400 });
  if (r.error && !r.generated) return Response.json({ error: r.error }, { status: 502 });
  return Response.json(r);
}
