import type { Metadata } from "next";
import { PartnerSignup } from "./PartnerSignup";

export const metadata: Metadata = {
  title: "Bring SportsAura to your bar",
  description: "A free live prediction game for your guests on match nights. Sign up your venue in a few minutes.",
};

export default function PartnerPage() {
  return <PartnerSignup />;
}
