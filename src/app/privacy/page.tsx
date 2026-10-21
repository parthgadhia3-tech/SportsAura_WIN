import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Notice" };

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
