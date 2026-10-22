import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabaseUrl.replace(/^http/, "ws");

// Content Security Policy: scripts only from this site, data only to our own
// Supabase project, and no framing by other sites (clickjacking).
const csp = [
  "default-src 'self'",
  // Razorpay Checkout (venue billing) loads its script and payment window from razorpay.com.
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isDev ? " 'unsafe-eval'" : ""}`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  // Brand logos, offer banners and theme backgrounds are https URLs set by admins.
  "img-src 'self' blob: data: https:",
  "font-src 'self'",
  `connect-src 'self' ${supabaseUrl} ${supabaseWs} https://api.razorpay.com https://lumberjack.razorpay.com`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Location is used only by this site (venue check-in); camera, mic etc. are off.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(self \"https://api.razorpay.com\"), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
