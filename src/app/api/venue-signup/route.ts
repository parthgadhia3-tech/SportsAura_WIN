import { supabaseAdmin } from "@/lib/supabase-admin";

// Very small per-instance limit: 5 signups per IP per hour. The admin
// approval step is the real gate; this just slows down scripted abuse.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

type Body = {
  venueName?: string;
  city?: string;
  address?: string;
  lat?: number;
  lng?: number;
  tables?: number;
  contactName?: string;
  phone?: string;
  email?: string;
  password?: string;
  plan?: "season" | "per_reward";
  gstin?: string;
  website?: string; // honeypot: must stay empty
  agree?: boolean;
};

/** Public: a venue signs itself up. The venue stays offline until approved or paid. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return Response.json({ error: "Too many signups from this network. Try again in an hour." }, { status: 429 });

  const b = (await request.json().catch(() => null)) as Body | null;
  if (!b || b.website) return Response.json({ ok: true }); // quietly drop bots

  const db = supabaseAdmin();
  const { data: st } = await db.from("app_settings").select("signup_open").maybeSingle();
  if (st && st.signup_open === false) return Response.json({ error: "Signups are closed right now. Contact us instead." }, { status: 403 });

  const name = b.venueName?.trim() ?? "";
  const city = b.city?.trim() || "Mumbai";
  const email = b.email?.trim().toLowerCase() ?? "";
  const phone = (b.phone ?? "").replace(/[^\d+]/g, "");
  const tables = Math.max(0, Math.min(200, Math.floor(Number(b.tables) || 0)));
  const gstin = b.gstin?.trim().toUpperCase() || null;
  const plan = b.plan === "per_reward" ? "per_reward" : "season";

  if (name.length < 2 || name.length > 60) return Response.json({ error: "Enter the venue's name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
  if (!/^\+?\d{10,13}$/.test(phone)) return Response.json({ error: "Enter a 10-digit mobile number." }, { status: 400 });
  if (!b.password || b.password.length < 10) return Response.json({ error: "Choose a password of at least 10 characters." }, { status: 400 });
  if (!b.contactName?.trim()) return Response.json({ error: "Enter your name." }, { status: 400 });
  if (typeof b.lat !== "number" || typeof b.lng !== "number" || Math.abs(b.lat) > 90 || Math.abs(b.lng) > 180)
    return Response.json({ error: "Add the venue's location (use the button while you're at the venue, or paste coordinates)." }, { status: 400 });
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) return Response.json({ error: "GSTIN should be 15 letters and numbers." }, { status: 400 });
  if (!b.agree) return Response.json({ error: "Please accept the venue terms." }, { status: 400 });

  // A free link name like "the-dugout-mumbai"
  const base = slugify(`${name} ${city}`) || "venue";
  let slug = base.length >= 3 ? base : `${base}-bar`;
  for (let i = 0; i < 6; i++) {
    const { data } = await db.from("venues").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: created, error: userErr } = await db.auth.admin.createUser({
    email,
    password: b.password,
    email_confirm: true,
    user_metadata: { name: b.contactName.trim(), signup: "venue" },
  });
  if (userErr || !created.user) {
    const taken = /already|registered|exists/i.test(userErr?.message ?? "");
    return Response.json(
      { error: taken ? "An account with this email already exists. Sign in at the venue dashboard instead." : "Couldn't create your login. Try again." },
      { status: 400 },
    );
  }
  const userId = created.user.id;

  const { data: venue, error: venueErr } = await db
    .from("venues")
    .insert({
      name,
      slug,
      city,
      address: b.address?.trim() || null,
      location: `SRID=4326;POINT(${b.lng} ${b.lat})`,
      is_active: false,
      table_count: tables,
    })
    .select("id")
    .single();
  if (venueErr || !venue) {
    await db.auth.admin.deleteUser(userId);
    return Response.json({ error: "Couldn't save the venue. Try again." }, { status: 400 });
  }

  const [{ error: accErr }, { error: staffErr }] = await Promise.all([
    db
      .from("venue_accounts")
      .update({ plan, status: "pending", approved_at: null, contact_name: b.contactName.trim(), contact_phone: phone, contact_email: email, gstin })
      .eq("venue_id", venue.id),
    db.from("staff").insert({ user_id: userId, role: "venue_manager", venue_id: venue.id, name: b.contactName.trim() }),
  ]);
  if (accErr || staffErr) {
    await db.from("venues").delete().eq("id", venue.id);
    await db.auth.admin.deleteUser(userId);
    return Response.json({ error: "Couldn't finish the signup. Try again." }, { status: 400 });
  }

  return Response.json({ ok: true, slug });
}
