// Fails the build if restricted real-money-gaming words appear in the app.
// Allowed vocabulary: Predict, Points, Rewards, Gamify.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BANNED = /\b(bet|bets|betting|bettor|wager\w*|gambl\w*|odds|stake|stakes|jackpot|casino|punter)\b/i;
const ROOTS = ["src", "supabase/seed.sql"];
const hits = [];

function walk(p) {
  const s = statSync(p);
  if (s.isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)));
  if (!/\.(tsx?|mjs|css|sql|json|md)$/.test(p)) return;
  readFileSync(p, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("check-copy:allow")) return;
      const m = line.match(BANNED);
      if (m) hits.push(`${p}:${i + 1}  "${m[0]}"  ${line.trim().slice(0, 100)}`);
    });
}

ROOTS.forEach(walk);
if (hits.length) {
  console.error("Restricted words found (use Predict / Points / Rewards instead):\n" + hits.join("\n"));
  process.exit(1);
}
console.log("Copy check passed: no restricted words.");
