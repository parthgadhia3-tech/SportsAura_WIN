import { redirect } from "next/navigation";

// Venues are switched off while SportsAura is played from anywhere.
// The pages under this folder are kept so the feature can come back; this layout hides them.
export default function HiddenLayout(): never {
  redirect("/");
}
