import type { NextRequest, NextResponse } from "next/server";

/**
 * Login cookies are re-issued by the server on every visit with a 400-day
 * lifetime. Safari deletes cookies written by page scripts after 7 days
 * without a visit, but keeps cookies set by the server, so players stay
 * logged in between occasional match nights.
 */
export const LOGIN_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export function restampAuthCookies(request: NextRequest, response: NextResponse, skip = new Set<string>()) {
  const secure = request.nextUrl.protocol === "https:";
  for (const c of request.cookies.getAll()) {
    if (!c.name.startsWith("sb-") || skip.has(c.name) || !c.value) continue;
    response.cookies.set(c.name, c.value, {
      path: "/",
      sameSite: "lax",
      httpOnly: false, // the browser client reads the session from this cookie
      secure,
      maxAge: LOGIN_COOKIE_MAX_AGE,
    });
  }
}
