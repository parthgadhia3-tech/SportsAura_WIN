import type { CSSProperties } from "react";
import type { Theme } from "./types";

export const DEFAULT_THEME: Theme = {
  id: "default",
  name: "Floodlight",
  bg_type: "gradient",
  bg_value: "radial-gradient(circle at 50% -10%, #1F5257 0%, #0C2427 45%, #071517 100%)",
  primary_color: "#FFB020",
  secondary_color: "#7FE0C8",
  text_color: "#F3F1E8",
  surface_color: "#123236",
  logo_url: null,
  sponsor_name: null,
};

const HEX = /^#[0-9a-f]{6}$/i;
const GRADIENT = /^(linear|radial)-gradient\([#%,.()a-zA-Z0-9 -]+\)$/;
const IMAGE = /^https:\/\/[^\s"'()<>]+$/;

/** Picks black or white text for a given background colour. */
export function onColor(hex: string): string {
  if (!HEX.test(hex)) return "#000000";
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#0A0A0A" : "#FFFFFF";
}

function safe(hex: string, fallback: string) {
  return HEX.test(hex) ? hex : fallback;
}

/**
 * Converts a theme row into CSS custom properties. Values are re-validated
 * here (the database validates too) so nothing unexpected reaches CSS.
 */
export function themeVars(theme: Theme | null | undefined): CSSProperties {
  const t = theme ?? DEFAULT_THEME;
  const primary = safe(t.primary_color, DEFAULT_THEME.primary_color);
  let background = DEFAULT_THEME.bg_value;
  if (t.bg_type === "solid" && HEX.test(t.bg_value)) background = t.bg_value;
  if (t.bg_type === "gradient" && GRADIENT.test(t.bg_value)) background = t.bg_value;
  if (t.bg_type === "image" && IMAGE.test(t.bg_value))
    background = `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.75)), url("${t.bg_value}") center / cover no-repeat`;

  return {
    "--brand-bg": background,
    "--brand-primary": primary,
    "--brand-on-primary": onColor(primary),
    "--brand-secondary": safe(t.secondary_color, DEFAULT_THEME.secondary_color),
    "--brand-text": safe(t.text_color, DEFAULT_THEME.text_color),
    "--brand-surface": safe(t.surface_color, DEFAULT_THEME.surface_color),
  } as CSSProperties;
}
