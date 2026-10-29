import "server-only";
import { supabaseAdmin } from "./supabase-admin";

export function tokenAal(token: string): string | undefined {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).aal;
  } catch {
    return undefined;
  }
}

export type StaffCaller = {
  db: ReturnType<typeof supabaseAdmin>;
  userId: string;
  role: "admin" | "game_master" | "venue_manager";
  venueId: string | null;
};

/** Verifies the bearer token, the staff role and 2-step login. Returns a Response on failure. */
export async function staffCaller(request: Request): Promise<StaffCaller | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in again." }, { status: 401 });
  const db = supabaseAdmin();
  const { data: caller } = await db.auth.getUser(token);
  if (!caller.user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { data: me } = await db.from("staff").select("role, venue_id").eq("user_id", caller.user.id).maybeSingle();
  if (!me) return Response.json({ error: "This account isn't a staff account." }, { status: 403 });
  const { data: settings } = await db.from("app_settings").select("require_staff_mfa").maybeSingle();
  if (settings?.require_staff_mfa !== false && tokenAal(token) !== "aal2")
    return Response.json({ error: "Complete 2-step login first." }, { status: 403 });
  return { db, userId: caller.user.id, role: me.role, venueId: me.venue_id };
}

/** Venue staff may act only on their own venue; admins on any. */
export function canManage(c: StaffCaller, venueId: string) {
  return c.role === "admin" || (c.role === "venue_manager" && c.venueId === venueId);
}

export function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

/** Marks a Razorpay order as paid and switches the venue's season pass on. Safe to call twice. */
export async function markOrderPaid(db: StaffCaller["db"], orderId: string, paymentId: string) {
  const { data: pay } = await db.from("payments").select("*").eq("provider_order_id", orderId).maybeSingle();
  if (!pay) return false;
  if (pay.status === "paid") return true;
  await db.from("payments").update({ status: "paid", provider_payment_id: paymentId, paid_at: new Date().toISOString() }).eq("id", pay.id);
  const { data: st } = await db.from("app_settings").select("season_ends_on").maybeSingle();
  const until = st?.season_ends_on ?? new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  await db
    .from("venue_accounts")
    .update({ plan: pay.plan, status: "active", paid_until: until, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("venue_id", pay.venue_id);
  await db.from("venues").update({ is_active: true }).eq("id", pay.venue_id);
  return true;
}

/** A signed-in player (phone login + finished onboarding). */
export async function playerCaller(request: Request): Promise<{ db: StaffCaller["db"]; userId: string } | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in again." }, { status: 401 });
  const db = supabaseAdmin();
  const { data } = await db.auth.getUser(token);
  if (!data.user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { data: u } = await db.from("users").select("id").eq("id", data.user.id).is("deleted_at", null).maybeSingle();
  if (!u) return Response.json({ error: "Finish setting up your profile first." }, { status: 403 });
  return { db, userId: u.id };
}
