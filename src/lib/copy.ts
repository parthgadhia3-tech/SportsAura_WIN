// Product copy in one place. Vocabulary rule: Predict, Points, Rewards.
// The build fails (npm run check:copy) if restricted words appear in src/.

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "SportsAura";
export { LEGAL_VERSION as TERMS_VERSION } from "./legal";

export const LIABILITY_LINE =
  "No purchase necessary. Venue reserves the right to verify ID for alcohol redemption.";

/** Maps database error codes to plain instructions for the player. */
export function friendlyError(raw: unknown): string {
  const msg = typeof raw === "string" ? raw : (raw as { message?: string })?.message ?? "";
  const map: Record<string, string> = {
    question_closed: "This question has closed. Watch for the next one.",
    already_answered: "You've already locked in an answer for this one.",
    verification_required: "Confirm you're at the venue to keep playing.",
    onboarding_required: "Finish setting up your profile first.",
    invalid_option: "Pick one of the options shown.",
    wrong_pin: "That PIN doesn't match. Check the TV screen or ask your server.",
    qr_expired: "That TV code has changed. Scan the QR on the TV again.",
    too_many_attempts: "Too many wrong PINs. Try again in 10 minutes.",
    match_not_live: "There's no live match right now.",
    venue_not_found: "This venue isn't active. Ask the staff for help.",
    out_of_range: "You don't seem to be at the venue.",
    code_not_found: "No reward matches that code.",
    code_from_another_venue: "This reward was won at a different venue.",
    already_redeemed: "This reward has already been redeemed.",
    expired: "This reward has expired.",
    forbidden: "Your account doesn't have access to this.",
    cannot_push: "Only drafts can be pushed, and the match must be live.",
    cannot_lock: "Only live questions can be locked.",
    cannot_resolve: "Only live or locked questions can be resolved.",
    cannot_void: "This question can't be voided.",
  };
  for (const key of Object.keys(map)) if (msg.includes(key)) return map[key];
  return msg || "Something went wrong. Try again.";
}

export const HOW_TO_PLAY = [
  {
    title: "Check in once",
    body: "Scan the QR code on the bar's TV and you're in for the whole match. You can also scan your table coaster and share your location, or use the PIN from your server.",
  },
  {
    title: "Watch for a question",
    body: "During the match, a prediction appears on your phone. You don't need to refresh.",
  },
  {
    title: "Lock in before the timer ends",
    body: "Tap your answer. You get one pick per question, and it can't be changed.",
  },
  {
    title: "Score points when you're right",
    body: "Correct predictions add points and move you up this bar's leaderboard.",
  },
  {
    title: "Collect rewards",
    body: "Some questions carry a reward. The fastest correct players win it, and it's saved to your wallet.",
  },
];

