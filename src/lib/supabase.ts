"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

let client: SupabaseClient | null = null;
let keepTimer: ReturnType<typeof setTimeout> | undefined;

/** Ask the server to re-issue the login cookies (see src/lib/auth-cookies.ts). */
function keepLogin() {
  clearTimeout(keepTimer);
  keepTimer = setTimeout(() => {
    fetch("/api/auth/keep", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {
      /* next page load re-issues them anyway */
    });
  }, 250);
}

/**
 * Browser Supabase client (anon key). The login session lives in cookies so
 * the server can keep it alive. All data access is enforced by RLS + RPCs.
 */
export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in.",
    );
  }
  client = createBrowserClient(url, key, {
    cookies: {
      getAll: () => parseCookieHeader(document.cookie ?? "").map((c) => ({ name: c.name, value: c.value ?? "" })),
      setAll(cookies) {
        const secure = location.protocol === "https:";
        cookies.forEach(({ name, value, options }) => {
          document.cookie = serializeCookieHeader(name, value, { ...options, secure });
        });
        keepLogin();
      },
    },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}
