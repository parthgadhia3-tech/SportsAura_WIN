import { NextResponse, type NextRequest } from "next/server";
import { restampAuthCookies } from "@/lib/auth-cookies";

/**
 * Called by the browser right after it logs in or refreshes the session, so
 * the new login cookies are immediately re-issued by the server (which
 * Safari keeps) instead of only existing as script-written cookies.
 */
export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  restampAuthCookies(request, response);
  return response;
}
