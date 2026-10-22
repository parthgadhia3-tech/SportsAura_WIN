import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Venue Partner Terms" };

export default function VenueTermsPage() {
  return <LegalPage kind="venue" />;
}
