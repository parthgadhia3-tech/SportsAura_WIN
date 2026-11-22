// Product copy in one place. Vocabulary rule: Predict, Points.
// The build fails (npm run check:copy) if restricted words appear in src/.

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "SportsAura";
export { LEGAL_VERSION as TERMS_VERSION } from "./legal";

export const LIABILITY_LINE = "No purchase necessary.";

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
    not_published: "Publish this event in Review & publish before starting it.",
    match_is_live: "End the match before unpublishing it.",
    match_not_live: "There's no live match right now.",
    group_not_found: "No group matches that code. Check it and try again.",
    too_many_groups: "You're in 20 groups already. Leave one to join another.",
    group_full: "This group is full.",
    age_required: "You need to be 18 or older to play.",
    name_required: "Add a display name of at least 2 letters.",
    terms_required: "Accept the terms to continue.",
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
    double_used: "You've already used your 2x points this match.",
    invalid_table: "Pick a table number from the list.",
    billing_not_configured: "Online payment isn't switched on yet. We'll send you an invoice instead.",
  };
  for (const key of Object.keys(map)) if (msg.includes(key)) return map[key];
  return msg || "Something went wrong. Try again.";
}

/** Every right answer in a live match is worth this many points. */
export const POINTS_PER_ANSWER = 10;

export const HOW_TO_PLAY = [
  {
    title: "Open Live when the match is on",
    body: "Play from anywhere: at home, at work or out with friends. Sign in once with your mobile number and you're in.",
  },
  {
    title: "Answer before the timer ends",
    body: "Questions pop up on your phone during the match. Tap your answer before the countdown runs out. One pick per question, and it can't be changed.",
  },
  {
    title: "10 points for every right answer",
    body: "Every right answer is worth 10 points. A wrong or missed answer scores 0. Nothing to buy, and points have no cash value.",
  },
  {
    title: "Climb the leaderboards",
    body: "See where you stand in this match and across the whole series.",
  },
  {
    title: "Make a group with friends",
    body: "Create a group, share its code, and see a leaderboard of just your group: your friends, your office or your favourite bar.",
  },
];
