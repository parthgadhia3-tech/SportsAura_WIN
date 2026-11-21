"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Item = { href: string; label: string; match: (p: string) => boolean; icon: ReactNode };

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Home",
    match: (p) => p === "/",
    icon: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z" />,
  },
  {
    href: "/live",
    label: "Live",
    match: (p) => p.startsWith("/live") || p.startsWith("/v/"),
    icon: (
      <>
        <rect x="3" y="5" width="18" height="12" rx="2" />
        <path d="M8 21h8M12 17v4" />
        <circle cx="12" cy="11" r="2" />
      </>
    ),
  },
  {
    href: "/play",
    label: "Rooms",
    match: (p) => p.startsWith("/play"),
    icon: (
      <>
        <circle cx="9" cy="9" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M17.5 14.5A5 5 0 0 1 20.5 19" />
      </>
    ),
  },
  {
    href: "/wallet",
    label: "Rewards",
    match: (p) => p.startsWith("/wallet"),
    icon: (
      <>
        <rect x="3.5" y="9" width="17" height="11" rx="1.5" />
        <path d="M2.5 9h19M12 9v11M12 9c-1.5-3-5.5-4-5.5-1.5S10 9 12 9Zm0 0c1.5-3 5.5-4 5.5-1.5S14 9 12 9Z" />
      </>
    ),
  },
  {
    href: "/me",
    label: "Me",
    match: (p) => p.startsWith("/me"),
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
  },
];

/**
 * The one bottom bar for the player app: Home, Live (bar game), Rooms,
 * Rewards, Me. The active tab shows its label; the rest are icons only.
 */
export function AppNav() {
  const path = usePathname() ?? "/";
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-ink/10 bg-[#071618]/85 px-3 pb-[max(.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((it) => {
          const on = it.match(path);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-label={it.label}
                aria-current={on ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl ${on ? "text-brand" : "text-ink/55"}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-[26px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={on ? 2.3 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {it.icon}
                </svg>
                {on && <span className="text-xs font-semibold leading-none">{it.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Remember the last bar the player opened, so Live can take them back. */
export const LAST_VENUE_KEY = "sa-last-venue";
