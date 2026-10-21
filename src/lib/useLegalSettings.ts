"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { LegalSettings } from "./legal";

let cache: LegalSettings | null = null;
let pending: Promise<LegalSettings | null> | null = null;

function load(): Promise<LegalSettings | null> {
  if (cache) return Promise.resolve(cache);
  pending ??= Promise.resolve(
    supabase()
      .from("app_settings")
      .select("terms_url, privacy_url, operator_name, operator_address, grievance_name, grievance_email, support_email")
      .maybeSingle(),
  ).then(({ data }) => {
    cache = (data as LegalSettings) ?? null;
    return cache;
  });
  return pending;
}

/** Public legal settings (T&C link, privacy link, operator, grievance contact). */
export function useLegalSettings() {
  const [settings, setSettings] = useState<LegalSettings | null>(cache);
  useEffect(() => {
    load().then(setSettings);
  }, []);
  return {
    settings,
    termsHref: settings?.terms_url || "/terms",
    privacyHref: settings?.privacy_url || "/privacy",
  };
}
