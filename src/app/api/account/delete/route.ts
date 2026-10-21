import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * DPDP erasure: deletes the caller's auth account. Profile, sessions, answers
 * and wallet rows cascade; click analytics keep the click but lose the user.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "not_authenticated" }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "not_authenticated" }, { status: 401 });

  const { data: staff } = await db.from("staff").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (staff) return Response.json({ error: "staff_accounts_are_managed_by_admin" }, { status: 400 });

  const { error: delError } = await db.auth.admin.deleteUser(data.user.id);
  if (delError) return Response.json({ error: delError.message }, { status: 500 });
  return Response.json({ ok: true });
}
