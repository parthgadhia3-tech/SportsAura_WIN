import { connection } from "next/server";
import { aiEnabled } from "@/lib/ai";

/** Lets the app show or hide AI features. Checked per request, not at build time. */
export async function GET() {
  await connection();
  return Response.json({ enabled: aiEnabled() });
}
