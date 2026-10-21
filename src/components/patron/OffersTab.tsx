"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Banner } from "@/lib/types";
import { Spinner } from "./ui";

export function OffersTab({ venueId }: { venueId: string }) {
  const [banners, setBanners] = useState<Banner[] | null>(null);

  useEffect(() => {
    supabase()
      .from("banners")
      .select("id, venue_id, title, subtitle, image_url, link_url, sort_order")
      .or(`venue_id.is.null,venue_id.eq.${venueId}`)
      .order("sort_order")
      .then(({ data }) => setBanners((data as Banner[]) ?? []));
  }, [venueId]);

  if (banners === null) return <Spinner label="Loading offers" />;
  if (banners.length === 0)
    return <p className="px-6 py-16 text-center text-ink/70">No offers right now. Check back during the break.</p>;

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 pt-4">
      {banners.map((b) => {
        const body = (
          <>
            {b.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.image_url} alt="" className="aspect-[16/9] w-full object-cover" />
            )}
            <div className="p-4">
              <h3 className="font-display text-2xl font-bold leading-tight">{b.title}</h3>
              {b.subtitle && <p className="mt-1 text-ink/75">{b.subtitle}</p>}
            </div>
          </>
        );
        return b.link_url ? (
          <a key={b.id} href={b.link_url} target="_blank" rel="noopener" className="block overflow-hidden rounded-2xl bg-surface/90">
            {body}
          </a>
        ) : (
          <div key={b.id} className="overflow-hidden rounded-2xl bg-surface/90">
            {body}
          </div>
        );
      })}
    </div>
  );
}
