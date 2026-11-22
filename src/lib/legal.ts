// Player-facing Terms of Use and Privacy Notice.
// Operator, address and grievance details come from Admin > Settings.
// Drafted for a free-to-play promotional game in India; have it reviewed by a
// lawyer before public launch.

export interface LegalSettings {
  terms_url: string | null;
  privacy_url: string | null;
  operator_name: string | null;
  operator_address: string | null;
  grievance_name: string | null;
  grievance_email: string | null;
  support_email: string | null;
}

export const LEGAL_UPDATED = "22 November 2026";
export const LEGAL_VERSION = "2026-11-22";

export type LegalSection = { heading: string; paras: string[] };

function who(s: LegalSettings | null) {
  const name = s?.operator_name?.trim() || "the operator of SportsAura";
  const addr = s?.operator_address?.trim();
  const griev = s?.grievance_name?.trim();
  const gEmail = s?.grievance_email?.trim();
  const support = s?.support_email?.trim() || gEmail;
  const contact = gEmail
    ? `${griev ? `${griev}, Grievance Officer, ` : "our Grievance Officer at "}${gEmail}`
    : "the Grievance Officer whose contact details are shown in the app";
  return { name, addr, contact, support };
}

export function termsOfUse(s: LegalSettings | null): LegalSection[] {
  const w = who(s);
  return [
    {
      heading: "1. About these terms",
      paras: [
        `SportsAura is a free live prediction game you can play from anywhere during live matches. It is operated by ${w.name}${w.addr ? `, ${w.addr}` : ""} ("we", "us").`,
        "By creating an account or playing, you agree to these Terms of Use and our Privacy Notice. If you don't agree, please don't use SportsAura.",
      ],
    },
    {
      heading: "2. Who can play",
      paras: [
        "You must be 18 or older. You confirm your age when you sign up.",
        "One account per person. Your account is personal and can't be transferred.",
      ],
    },
    {
      heading: "3. Free to play, no purchase necessary",
      paras: [
        "SportsAura is free. There are no entry fees, deposits, stakes or paid features, and you never need to buy anything to play.", // check-copy:allow (legal disclaimer)
        "SportsAura is a free online social game played for entertainment. It is not a betting, wagering or gambling service and is not an online money game.", // check-copy:allow (legal disclaimer)
        "Points have no monetary value. They can't be bought, sold, transferred or exchanged for cash or anything else.",
      ],
    },
    {
      heading: "4. How the game works",
      paras: [
        "During a match, the game host sends prediction questions. You can answer each question once, before its timer runs out, and you can't change your answer.",
        "The host settles each question based on what happens in the match. If a question can't be settled fairly (for example because of a broadcast delay, an unclear outcome or a technical problem), the host may lock it early or void it, and no points are awarded for a voided question.",
        "The host's decision on results is final, subject to the complaint process in section 12.",
        "Every right answer is worth 10 points, and a wrong or missed answer scores 0. Leaderboards rank players by points for each match and for each series.",
        "You can create or join private groups to see a leaderboard of just the group's members. Group names must not be offensive or impersonate anyone.",
      ],
    },
    {
      heading: "5. Sponsors and prizes",
      paras: [
        "Matches and questions may be presented by sponsors, whose names and logos appear in the game. Opening a sponsor's link takes you to their website, which is governed by their own terms and privacy policy.",
        "SportsAura does not currently offer prizes or rewards. If prizes are added, they will come with their own terms, shown before they apply.",
      ],
    },
    {
      heading: "6. Trivia rooms and AI-written questions",
      paras: [
        "You can create or join private trivia rooms and the daily quiz. Rooms are free, and points in rooms have no value.",
        "Some questions are written by artificial intelligence. Every one is checked by rules and by a separate, independent AI check before it is used, and current affairs questions must come from a named news source. Even so, a question can occasionally be wrong. If you think it is, tap “Wrong answer?”. When two players report a question, we remove it and take its points out of the game.",
        "If you type your own topic, keep it respectful. We may refuse topics about religion, caste, party politics, sexual content, violence, alcohol, gambling or any real person's private life. Don't type personal information into a topic.", // check-copy:allow (legal)
        "Room names and codes are chosen by players and must not be offensive or impersonate anyone. Nobody may play for money or anything of value, inside or outside the app.",
      ],
    },
    {
      heading: "7. Fair play",
      paras: [
        "You must not use more than one account, use automated tools, or interfere with the game.",
        "If we reasonably believe you have broken these rules, we may suspend your account and cancel points obtained unfairly.",
      ],
    },
    {
      heading: "8. Play responsibly",
      paras: [
        "SportsAura is for fun. Please don't play while driving, and take a break whenever you need one.",
      ],
    },
    {
      heading: "9. Your account",
      paras: [
        "You sign in with your mobile number and a one-time code. Keep your phone secure, because anyone with access to it may be able to use your account.",
        "You can delete your account at any time from Me, then Delete my account and data.",
      ],
    },
    {
      heading: "10. Names, brands and content",
      paras: [
        "Team, league, tournament and brand names are used only to describe matches and sponsors and belong to their owners. SportsAura is not affiliated with, endorsed or sponsored by any league, team or broadcaster.",
        "The SportsAura app, design and content belong to us. You may use them only to play the game.",
      ],
    },
    {
      heading: "11. Availability and liability",
      paras: [
        "We work to keep SportsAura running smoothly but can't promise it will always be available or error-free, for example if your internet connection or the broadcast is interrupted.",
        "To the extent the law allows, we are not responsible for sponsors' websites or offers, for indirect losses, or for losses caused by events outside our reasonable control. Nothing in these terms limits rights you have under the Consumer Protection Act, 2019 or other law that can't be excluded.",
      ],
    },
    {
      heading: "12. Complaints and grievances",
      paras: [
        `If you have a complaint about the game, a result or your data, contact ${w.contact}. We will acknowledge your complaint within 24 hours and aim to resolve it within 15 days.`,
        "If you are not satisfied with our response, you may escalate as allowed under applicable law, including to the Online Gaming Authority of India for gaming matters or the Data Protection Board of India for personal data matters.",
      ],
    },
    {
      heading: "13. Changes, suspension and law",
      paras: [
        "We may update these terms. If the changes are significant, we will tell you in the app before they apply, and continuing to play means you accept them.",
        "We may suspend or end the game for any match. These terms are governed by the laws of India, and the courts at Mumbai, Maharashtra have jurisdiction, subject to any rights you have to bring a complaint elsewhere.",
        w.support ? `Questions? Write to ${w.support}.` : "Questions? Contact us through the details shown in the app.",
      ],
    },
  ];
}

export function privacyNotice(s: LegalSettings | null): LegalSection[] {
  const w = who(s);
  return [
    {
      heading: "1. Who we are",
      paras: [
        `${w.name}${w.addr ? `, ${w.addr}` : ""} runs SportsAura and decides how your personal data is used (the "Data Fiduciary" under the Digital Personal Data Protection Act, 2023).`,
        `For any privacy question or request, contact ${w.contact}.`,
      ],
    },
    {
      heading: "2. What we collect",
      paras: [
        "Your mobile number (to sign you in), your display name, your age confirmation, and the dates you agreed to our terms and (if you chose it) match reminders and offers.",
        "Your answers, points, leaderboard positions and the groups you create or join. We do not collect your location.",
        "When you open a sponsor's link, we record that it was opened (including your browser type).",
        "If you play trivia rooms: room names and codes, who is in each room, your answers, scores, reactions and any question reports, and topics you type for AI questions.",
        "Basic technical logs needed to keep the service secure.",
      ],
    },
    {
      heading: "3. Why we use it",
      paras: [
        "To run the game: sign you in, record answers, award points, show leaderboards and groups, and keep your history.",
        "To keep the game fair and secure, prevent abuse and handle complaints.",
        "To measure how sponsors perform, using link-click counts.",
        "To send you match reminders and offers, only if you switched that on. You can switch it off any time in Me.",
        "We use your data based on your consent, given when you sign up, and as allowed by law.",
      ],
    },
    {
      heading: "4. Who sees it",
      paras: [
        "Other players see only your display name and points on leaderboards. Members of a group you join see your display name and points in that group.",
        "Sponsors do not receive your personal data from us. If you open a sponsor's link, that sponsor's own privacy policy applies to what you share with them.",
        "We use service providers to run SportsAura: Supabase (database, hosted in Mumbai, India), Vercel (website hosting), Twilio (sending sign-in codes by SMS) and Anthropic (writing and checking trivia questions with AI), which may process data outside India. They act on our instructions and must protect your data.",
        "When you type a topic for an AI trivia room, only the topic text is sent to Anthropic, never your name, number or other personal data.",
        "We do not sell your personal data. We may disclose data where the law requires it.",
      ],
    },
    {
      heading: "5. How long we keep it",
      paras: [
        "Your account and game history are kept until you delete your account, or for up to 3 years after your last activity.",
        "Security logs and link-click records are kept for up to 1 year. Trivia rooms and their answers are kept for up to 1 year.",
        "When you delete your account, your profile, answers, points and group memberships are deleted. Link-click counts are kept only without your identity.",
      ],
    },
    {
      heading: "6. Your rights",
      paras: [
        "You can ask to see the personal data we hold about you, correct it, or have it erased. You can withdraw any consent at any time.",
        "You can delete your account yourself in Me. For other requests, contact the Grievance Officer. You can also nominate someone to exercise your rights if you are unable to.",
        "If you are not satisfied with how we handle a complaint, you can complain to the Data Protection Board of India.",
      ],
    },
    {
      heading: "7. Security",
      paras: [
        "We protect your data with access controls, encryption in transit, strict database rules so each player can only see their own data, 2-step login for staff, and activity logs.",
        "If a breach affects your personal data, we will inform you and the Data Protection Board as the law requires.",
      ],
    },
    {
      heading: "8. Age",
      paras: [
        "SportsAura is only for people aged 18 and over. We do not knowingly collect data from anyone younger. If you believe someone under 18 has signed up, contact us and we will delete their account.",
      ],
    },
    {
      heading: "9. Changes",
      paras: [
        "We may update this notice. If the changes are significant, we will tell you in the app.",
      ],
    },
  ];
}

/** Terms for venues that sign up (draft: have a lawyer review before launch). */
export function venueTerms(s: LegalSettings | null): LegalSection[] {
  const w = who(s);
  return [
    {
      heading: "1. The service",
      paras: [
        `${w.name} provides SportsAura to your venue: the free player game, the TV screen, the venue dashboard, reports and support. These Venue Partner Terms apply together with the plan you choose when you sign up.`,
      ],
    },
    {
      heading: "2. Plans and payment",
      paras: [
        "Season pass: a single payment for the period shown when you pay. Pay per reward: a monthly bill for each reward redeemed at your venue, at the rate shown on your Plan & billing page.",
        "Online payments are processed by Razorpay. Prices may change for future periods; we will tell you before a change applies to you. Fees already paid for a period are not refundable once that period has started, except where the law requires.",
        "We may pause the service at your venue if a bill is unpaid 15 days after its due date.",
      ],
    },
    {
      heading: "3. Your responsibilities",
      paras: [
        "You confirm you hold any licences needed to screen matches and to run your business, including any commercial viewing subscription required by the broadcaster.",
        "You honour rewards you offer through SportsAura while they are valid, check ID where the law or the reward requires it, refuse alcohol to anyone under the legal age, and serve responsibly.",
        "You won't charge guests to play, sell points, or present SportsAura as betting or gambling. You won't offer alcohol brand sponsorships through SportsAura.", // check-copy:allow (legal)
        "You keep your staff login, 2-step login device and the TV screen secure, and tell us promptly if you suspect misuse.",
      ],
    },
    {
      heading: "4. Data",
      paras: [
        "Guests' personal data is controlled by us under our Privacy Notice. Through the dashboard you see display names, points, check-in method and redemptions at your venue, and aggregate reports. You use this only to run the game and your venue, and you don't copy it elsewhere.",
      ],
    },
    {
      heading: "5. Names and content",
      paras: [
        "You let us show your venue name, address and logo in the app and in our marketing of SportsAura. You don't use league, team or broadcaster logos in SportsAura content you supply.",
      ],
    },
    {
      heading: "6. Liability and ending",
      paras: [
        "We work to keep SportsAura available but don't guarantee it will be uninterrupted. To the extent the law allows, our total liability to your venue is limited to the fees you paid us in the 3 months before the claim.",
        "Either side may end these terms with 30 days' notice, or straight away if the other seriously breaches them. These terms are governed by the laws of India, with courts at Mumbai, Maharashtra.",
        w.support ? `Questions: ${w.support}.` : "Questions: contact us through the details on our website.",
      ],
    },
  ];
}
