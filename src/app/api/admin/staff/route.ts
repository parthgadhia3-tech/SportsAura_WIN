import { supabaseAdmin } from "@/lib/supabase-admin";

const ROLES = new Set(["admin", "game_master", "venue_manager"]);

/** Admin-only: create a staff login (email + password) and its role. */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in again." }, { status: 401 });

  const db = supabaseAdmin();
  const { data: caller } = await db.auth.getUser(token);
  if (!caller.user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { data: me } = await db.from("staff").select("role").eq("user_id", caller.user.id).maybeSingle();
  if (me?.role !== "admin") return Response.json({ error: "Only admins can add staff." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as
    | { name?: string; email?: string; password?: string; role?: string; venue_id?: string | null }
    | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !body?.password || body.password.length < 10 || !body.role || !ROLES.has(body.role))
    return Response.json({ error: "Email, a password of 10+ characters and a role are required." }, { status: 400 });
  if (body.role === "venue_manager" && !body.venue_id)
    return Response.json({ error: "Pick the venue for this manager." }, { status: 400 });

  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: { name: body.name ?? null },
  });
  if (error || !created.user) return Response.json({ error: error?.message ?? "Couldn't create the login." }, { status: 400 });

  const { error: staffErr } = await db.from("staff").insert({
    user_id: created.user.id,
    role: body.role,
    venue_id: body.role === "venue_manager" ? body.venue_id : null,
    name: body.name?.trim() || null,
  });
  if (staffErr) {
    await db.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: staffErr.message }, { status: 400 });
  }
  return Response.json({ ok: true });
}
