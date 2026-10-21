import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { LOGIN_COOKIE_MAX_AGE, restampAuthCookies } from "@/lib/auth-cookies";

/**
 * Runs before every page load: refreshes the player's login if the access
 * token has expired, then re-issues the login cookies from the server so
 * the browser keeps them for 400 days.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;

  const written = new Set<string>();
  const secure = request.nextUrl.protocol === "https:";
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => {
          written.add(name);
          response.cookies.set(name, value, {
            ...options,
            secure,
            ...(value ? { maxAge: LOGIN_COOKIE_MAX_AGE } : {}),
          });
        });
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Reads the session from the cookie; only calls Supabase if it needs refreshing.
  await supabase.auth.getSession();

  restampAuthCookies(request, response, written);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
