import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Click tracker: /api/track?c=<user_coupon_id>
 * Logs (user, coupon, bucket, venue, time) as first-party data, then 302s to
 * the affiliate URL stored server-side. The destination is never taken from
 * the request, so this cannot be abused as an open redirect.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("c") ?? "";
  const fallback = new URL("/wallet", request.url);
  if (!UUID.test(id)) return Response.redirect(fallback, 302);

  const db = supabaseAdmin();
  const { data: coupon } = await db
    .from("user_coupons")
    .select("id, user_id, bucket_id, venue_id, expires_at, coupon_buckets(is_active, coupon_bucket_secrets(affiliate_url))")
    .eq("id", id)
    .maybeSingle();

  type Row = {
    id: string;
    user_id: string;
    bucket_id: string;
    venue_id: string | null;
    expires_at: string | null;
    coupon_buckets: { is_active: boolean; coupon_bucket_secrets: { affiliate_url: string | null } | null } | null;
  };
  const c = coupon as Row | null;
  const url = c?.coupon_buckets?.coupon_bucket_secrets?.affiliate_url;
  const expired = c?.expires_at ? new Date(c.expires_at) < new Date() : false;
  if (!c || !url || !c.coupon_buckets?.is_active || expired) return Response.redirect(fallback, 302);

  // Log first, but never let a logging failure block the patron.
  const { error } = await db.from("click_analytics").insert({
    user_id: c.user_id,
    user_coupon_id: c.id,
    bucket_id: c.bucket_id,
    venue_id: c.venue_id,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) console.error("click log failed", error.message);

  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
