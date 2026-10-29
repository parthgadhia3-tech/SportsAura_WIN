import type { Metadata } from "next";
import { PlayHub } from "@/components/play/PlayHub";

export const metadata: Metadata = { title: "Play trivia with friends", description: "Free trivia rooms for your group: cricket, Bollywood, current affairs or any topic." };

export default function PlayPage() {
  return <PlayHub />;
}
