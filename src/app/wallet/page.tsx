import { redirect } from "next/navigation";

// Rewards are paused while the new reward logic is designed.
export default function WalletPage() {
  redirect("/me");
}
