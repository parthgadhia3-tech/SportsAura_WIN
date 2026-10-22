import { canManage, staffCaller } from "@/lib/server-auth";

/** A venue switches itself to pay-per-reward (billed monthly from redemptions). */
export async function POST(request: Request) {
  const c = await staffCaller(request);
  if (c instanceof Response) return c;
  const b = (await request.json().catch(() => null)) as { venueId?: string; plan?: string } | null;
  if (!b?.venueId || !canManage(c, b.venueId)) return Response.json({ error: "Your account can't change this venue's plan." }, { status: 403 });
  if (b.plan !== "per_reward") return Response.json({ error: "Pay for the season pass to switch to it." }, { status: 400 });
  const { data: acc } = await c.db.from("venue_accounts").select("status").eq("venue_id", b.venueId).maybeSingle();
  if (!acc || acc.status === "cancelled") return Response.json({ error: "This venue is paused. Contact us." }, { status: 403 });
  await c.db.from("venue_accounts").update({ plan: "per_reward", updated_at: new Date().toISOString() }).eq("venue_id", b.venueId);
  return Response.json({ ok: true });
}
