import { canManage, razorpayKeys, staffCaller } from "@/lib/server-auth";

/** Creates a Razorpay order for the season pass of the caller's venue. */
export async function POST(request: Request) {
  const c = await staffCaller(request);
  if (c instanceof Response) return c;
  const body = (await request.json().catch(() => null)) as { venueId?: string } | null;
  const venueId = body?.venueId;
  if (!venueId || !canManage(c, venueId)) return Response.json({ error: "Your account can't pay for this venue." }, { status: 403 });

  const keys = razorpayKeys();
  if (!keys) return Response.json({ error: "billing_not_configured" }, { status: 503 });

  const [{ data: st }, { data: v }, { data: acc }] = await Promise.all([
    c.db.from("app_settings").select("season_price_inr").maybeSingle(),
    c.db.from("venues").select("name").eq("id", venueId).maybeSingle(),
    c.db.from("venue_accounts").select("contact_name, contact_email, contact_phone, status").eq("venue_id", venueId).maybeSingle(),
  ]);
  const price = st?.season_price_inr ?? 0;
  if (price <= 0) return Response.json({ error: "The season pass price isn't set yet. Contact us." }, { status: 400 });
  if (acc?.status === "cancelled") return Response.json({ error: "This venue is paused. Contact us to switch it back on." }, { status: 403 });

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64"),
    },
    body: JSON.stringify({ amount: price * 100, currency: "INR", receipt: `season-${venueId.slice(0, 8)}-${Date.now()}`, notes: { venue_id: venueId, plan: "season" } }),
  });
  const order = (await res.json().catch(() => null)) as { id?: string; amount?: number } | null;
  if (!res.ok || !order?.id) return Response.json({ error: "Payment couldn't start. Try again in a minute." }, { status: 502 });

  await c.db.from("payments").insert({ venue_id: venueId, plan: "season", amount_paise: order.amount ?? price * 100, provider_order_id: order.id });
  return Response.json({
    orderId: order.id,
    amount: order.amount,
    keyId: keys.keyId,
    venueName: v?.name ?? "Venue",
    prefill: { name: acc?.contact_name ?? "", email: acc?.contact_email ?? "", contact: acc?.contact_phone ?? "" },
  });
}
