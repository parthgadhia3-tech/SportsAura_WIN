import { aiEnabled, topicAllowed } from "@/lib/ai";
import { playerCaller } from "@/lib/server-auth";
import { produceVerified } from "@/lib/trivia-pipeline";

export const maxDuration = 120;
const DAILY_LIMIT = 6; // custom-topic generations per player per day

/** Makes sure a custom-topic room has enough fact-checked questions before it starts. */
export async function POST(request: Request) {
  const c = await playerCaller(request);
  if (c instanceof Response) return c;
  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim().toUpperCase();
  const { data: room } = await c.db.from("rooms").select("id, host_id, status, custom_topic, question_count").eq("code", code ?? "").maybeSingle();
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });
  if (room.host_id !== c.userId) return Response.json({ error: "Only the host can do this." }, { status: 403 });
  if (!room.custom_topic) return Response.json({ ready: true });
  const topic = room.custom_topic.trim().toLowerCase();
  if (!topicAllowed(topic)) return Response.json({ error: "Pick a different topic. That one can't be used for a quiz." }, { status: 400 });

  const have = async () =>
    (await c.db.from("trivia_questions").select("id", { count: "exact", head: true }).eq("topic", topic).eq("status", "verified")).count ?? 0;
  let available = await have();
  if (available >= room.question_count) return Response.json({ ready: true, available });

  if (!aiEnabled()) return Response.json({ error: "Custom topics need the AI switched on. Pick a category instead." }, { status: 503 });
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count: used } = await c.db.from("ai_jobs").select("id", { count: "exact", head: true }).eq("user_id", c.userId).eq("kind", "custom").gte("created_at", since);
  if ((used ?? 0) >= DAILY_LIMIT) return Response.json({ error: "You've made a lot of custom rooms today. Try a category, or come back tomorrow." }, { status: 429 });

  const r = await produceVerified(c.db, { kind: "custom", userId: c.userId, topic, want: room.question_count - available });
  if (r.refused) return Response.json({ error: r.refused }, { status: 400 });
  available = await have();
  if (available < 3) return Response.json({ error: "We couldn't make enough questions we're sure about for that topic. Try something a bit broader." }, { status: 422 });
  return Response.json({ ready: true, available, passed: r.passed, generated: r.generated });
}
