import { redirect } from "next/navigation";

// Old bar QR codes and coasters (/v/<bar>) now open the Live tab: play from anywhere.
export default function VenuePage() {
  redirect("/live");
}
