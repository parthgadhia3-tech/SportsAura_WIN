// Product copy in one place. Vocabulary rule: Predict, Points, Rewards.
// The build fails (npm run check:copy) if restricted words appear in src/.

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "MatchDay";
export const TERMS_VERSION = "2026-10-20";

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

export const TERMS: { heading: string; body: string }[] = [
  {
    heading: "Free to play",
    body: "This is a free promotional game of skill and knowledge. There are no entry fees, deposits or purchases, and points have no cash value. Points cannot be bought, sold or transferred.",
  },
  {
    heading: "Who can play",
    body: "You must be 21 or older and physically present at a participating venue. Rewards involving spirits are available only to players aged 25 or older, in line with Maharashtra excise rules.",
  },
  {
    heading: "Rewards",
    body: `${LIABILITY_LINE} Rewards are provided by the venue or by the brand shown on the reward, are subject to their terms and expiry dates, and cannot be exchanged for cash. Quantities may be limited, and the fastest correct answers win first.`,
  },
  {
    heading: "Location and your data",
    body: "We use your location once when you join, and silently while you play, only to confirm you're at the venue. We store whether you passed and your distance from the venue, never your coordinates. We store your phone number, display name, answers, points, rewards and which rewards you open, to run the game and measure offers. You can delete your account from the More tab at any time, which removes your profile and history.",
  },
  {
    heading: "Fair play",
    body: "One account per person. Sharing the venue PIN with people outside the venue, automated play, or other abuse can lead to removal and cancelled rewards. The game host's decision on results is final; if a question can't be settled, it's voided and no points are awarded.",
  },
  {
    heading: "Drink responsibly",
    body: "Never drink and drive. Playing does not require you to buy or consume anything.",
  },
];
