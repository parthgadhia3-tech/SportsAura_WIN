import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { markOrderPaid } from "@/lib/server-auth";

/** Razorpay webhook (payment.captured / order.paid): a backup in case the browser closed before verify. */
export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return new Response("not configured", { status: 503 });
  const raw = await request.text();
  const sig = request.headers.get("x-razorpay-signature") ?? "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return new Response("bad signature", { status: 400 });

  const evt = JSON.parse(raw) as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } }; order?: { entity?: { id?: string } } };
  };
  if (evt.event === "payment.captured" || evt.event === "order.paid") {
    const orderId = evt.payload?.payment?.entity?.order_id ?? evt.payload?.order?.entity?.id;
    const paymentId = evt.payload?.payment?.entity?.id ?? "webhook";
    if (orderId) await markOrderPaid(supabaseAdmin(), orderId, paymentId);
  }
  return new Response("ok");
}
