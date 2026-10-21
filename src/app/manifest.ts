import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: process.env.NEXT_PUBLIC_APP_NAME || "MatchDay",
    short_name: process.env.NEXT_PUBLIC_APP_NAME || "MatchDay",
    description: "Free live match predictions at your sports bar.",
    start_url: "/",
    display: "standalone",
    background_color: "#0C2427",
    theme_color: "#0C2427",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
