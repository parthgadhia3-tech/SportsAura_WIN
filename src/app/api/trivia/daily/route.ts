import { aiEnabled } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { produceVerified } from "@/lib/trivia-pipeline";

export const maxDuration = 300;

/** Nightly (Vercel Cron): top up every category with fresh, fact-checked questions. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!aiEnabled()) return Response.json({ skipped: "AI not configured" });
  const db = supabaseAdmin();
  const perCat = Number(process.env.TRIVIA_DAILY_PER_CATEGORY) || 6;
  const { data: cats } = await db.from("trivia_categories").select("id, slug, kind").eq("is_active", true);
  const results = await Promise.all(
    (cats ?? []).map(async (c) => ({
      category: c.slug,
      ...(await produceVerified(db, { kind: "daily", categoryId: c.id, want: c.kind === "current" ? perCat + 4 : perCat })),
    })),
  );
  return Response.json({ results });
}
