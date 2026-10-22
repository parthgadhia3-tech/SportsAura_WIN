import crypto from "node:crypto";
import { canManage, markOrderPaid, razorpayKeys, staffCaller } from "@/lib/server-auth";

/** Checkout success: verify Razorpay's signature, then switch the plan on. */
export async function POST(request: Request) {
  const c = await staffCaller(request);
  if (c instanceof Response) return c;
  const keys = razorpayKeys();
  if (!keys) return Response.json({ error: "billing_not_configured" }, { status: 503 });
  const b = (await request.json().catch(() => null)) as { orderId?: string; paymentId?: string; signature?: string } | null;
  if (!b?.orderId || !b.paymentId || !b.signature) return Response.json({ error: "Missing payment details." }, { status: 400 });

  const expected = crypto.createHmac("sha256", keys.keySecret).update(`${b.orderId}|${b.paymentId}`).digest("hex");
  const ok = expected.length === b.signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(b.signature));
  if (!ok) return Response.json({ error: "We couldn't confirm this payment. If money left your account, contact us." }, { status: 400 });

  const { data: pay } = await c.db.from("payments").select("venue_id").eq("provider_order_id", b.orderId).maybeSingle();
  if (!pay || !canManage(c, pay.venue_id)) return Response.json({ error: "Payment not found for your venue." }, { status: 404 });
  await markOrderPaid(c.db, b.orderId, b.paymentId);
  return Response.json({ ok: true });
}
