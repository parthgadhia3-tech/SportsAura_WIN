import { Suspense } from "react";
import { PatronApp } from "@/components/patron/PatronApp";

// Entry point printed on the NFC/QR coaster: https://<domain>/v/<venue-slug>
export default function VenuePage({ params }: PageProps<"/v/[slug]">) {
  return (
    <Suspense fallback={<div className="brand-canvas min-h-dvh" />}>
      <VenueLoader params={params} />
    </Suspense>
  );
}

async function VenueLoader({ params }: Pick<PageProps<"/v/[slug]">, "params">) {
  const { slug } = await params;
  return <PatronApp slug={slug.toLowerCase()} />;
}
