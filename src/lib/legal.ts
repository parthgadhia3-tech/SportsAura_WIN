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

export const LEGAL_UPDATED = "22 October 2026";
export const LEGAL_VERSION = "2026-10-22";

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
        `SportsAura is a free live prediction game played at participating sports bars, pubs and clubs. It is operated by ${w.name}${w.addr ? `, ${w.addr}` : ""} ("we", "us").`,
        "By creating an account or playing, you agree to these Terms of Use and our Privacy Notice. If you don't agree, please don't use SportsAura.",
      ],
    },
    {
      heading: "2. Who can play",
      paras: [
        "You must be 21 or older and physically present at a participating venue during a live match. You confirm your age when you sign up, and venue staff may ask for ID.",
        "Rewards that include spirits are only available to players who confirm they are 25 or older, in line with Maharashtra excise rules. Alcohol rewards are only offered where the law allows.",
        "One account per person. Your account is personal and can't be transferred.",
      ],
    },
    {
      heading: "3. Free to play, no purchase necessary",
      paras: [
        "SportsAura is free. There are no entry fees, deposits, stakes or paid features, and you never need to buy food or drink to play or to win.", // check-copy:allow (legal disclaimer)
        "SportsAura is a free online social game played for entertainment. It is not a betting, wagering or gambling service and is not an online money game.", // check-copy:allow (legal disclaimer)
        "Points have no monetary value. They can't be bought, sold, transferred or exchanged for cash or anything else.",
      ],
    },
    {
      heading: "4. How the game works",
      paras: [
        "During a match, the game host sends prediction questions. You can answer each question once, before its timer runs out, and you can't change your answer.",
        "The host settles each question based on what happens in the match. If a question can't be settled fairly (for example because of a broadcast delay, an unclear outcome or a technical problem), the host may lock it early or void it, and no points are awarded for a voided question.",
        "The host's decision on results is final, subject to the complaint process in section 11.",
      ],
    },
    {
      heading: "5. Rewards",
      paras: [
        "Some correct answers win a reward, such as a food or drink offer from the venue or an offer from a partner brand. Rewards are provided by the venue or brand named on the reward, not by us, and are subject to their terms, availability and expiry dates.",
        "Rewards are limited and are given while stocks last, generally in the order correct answers were received. A reward can't be exchanged for cash, transferred or resold.",
        "No purchase is necessary. The venue reserves the right to verify ID for alcohol redemption and may refuse service in line with the law and its own policies.",
        "Some brand rewards open the brand's own website. We may receive a commission when you use these links. Your use of a brand's website is governed by that brand's terms and privacy policy.",
      ],
    },
    {
      heading: "6. Checking in and fair play",
      paras: [
        "To play, you check in by scanning the code on the venue's screen, by a location check, or with the venue PIN. These exist to make sure only people at the venue take part.",
        "You must not share check-in codes or PINs with people outside the venue, use more than one account, use automated tools, or interfere with the game.",
        "If we reasonably believe you have broken these rules, we may suspend your account and cancel points or rewards obtained unfairly.",
      ],
    },
    {
      heading: "7. Drink responsibly",
      paras: [
        "Playing never requires drinking. Please drink responsibly and never drink and drive.",
      ],
    },
    {
      heading: "8. Your account",
      paras: [
        "You sign in with your mobile number and a one-time code. Keep your phone secure, because anyone with access to it may be able to use your account.",
        "You can delete your account at any time from More, then Me, then Delete my account and data.",
      ],
    },
    {
      heading: "9. Names, brands and content",
      paras: [
        "Team, league, tournament and brand names are used only to describe matches and offers and belong to their owners. SportsAura is not affiliated with, endorsed or sponsored by any league, team or broadcaster.",
        "The SportsAura app, design and content belong to us. You may use them only to play the game.",
      ],
    },
    {
      heading: "10. Availability and liability",
      paras: [
        "We work to keep SportsAura running smoothly but can't promise it will always be available or error-free, for example if the venue's internet or the broadcast is interrupted.",
        "To the extent the law allows, we are not responsible for rewards provided by venues or brands, for indirect losses, or for losses caused by events outside our reasonable control. Nothing in these terms limits rights you have under the Consumer Protection Act, 2019 or other law that can't be excluded.",
      ],
    },
    {
      heading: "11. Complaints and grievances",
      paras: [
        `If you have a complaint about the game, a result, a reward or your data, contact ${w.contact}. We will acknowledge your complaint within 24 hours and aim to resolve it within 15 days.`,
        "If you are not satisfied with our response, you may escalate as allowed under applicable law, including to the Online Gaming Authority of India for gaming matters or the Data Protection Board of India for personal data matters.",
      ],
    },
    {
      heading: "12. Changes, suspension and law",
      paras: [
        "We may update these terms. If the changes are significant, we will tell you in the app before they apply, and continuing to play means you accept them.",
        "We may suspend or end the game at any venue or for any match. These terms are governed by the laws of India, and the courts at Mumbai, Maharashtra have jurisdiction, subject to any rights you have to bring a complaint elsewhere.",
        w.support ? `Questions? Write to ${w.support}.` : "Questions? Contact us through the venue staff or the details shown in the app.",
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
        "Your mobile number (to sign you in), your display name, your age confirmations, and the dates you agreed to our terms, location check and (if you chose it) club offers.",
        "Check-in results: the venue, the match, how you checked in, and if you used location, your approximate distance from the venue. We never store your GPS coordinates.",
        "Your answers, points, leaderboard positions, rewards won and redeemed, and when you open a brand reward link (including your browser type).",
        "Basic technical logs needed to keep the service secure.",
      ],
    },
    {
      heading: "3. Why we use it",
      paras: [
        "To run the game: sign you in, confirm you're at the venue, record answers, award points and rewards, show leaderboards and keep your history.",
        "To keep the game fair and secure, prevent abuse and handle complaints.",
        "To measure how offers perform, using reward and link-click data.",
        "To send you club offers during the match, only if you switched that on. You can switch it off any time in More, then Me.",
        "We use your data based on your consent, given when you sign up, and as allowed by law.",
      ],
    },
    {
      heading: "4. Who sees it",
      paras: [
        "Other players and the venue's screen see only your display name and points. Staff at the venue where you play see your display name, points, how you checked in and the rewards you redeem there.",
        "Brands do not receive your personal data from us. If you open a brand's link, that brand's own privacy policy applies to what you share with them.",
        "We use service providers to run SportsAura: Supabase (database, hosted in Mumbai, India), Vercel (website hosting) and Twilio (sending sign-in codes by SMS), which may process data outside India. They act on our instructions and must protect your data.",
        "We do not sell your personal data. We may disclose data where the law requires it.",
      ],
    },
    {
      heading: "5. How long we keep it",
      paras: [
        "Your account and game history are kept until you delete your account, or for up to 3 years after your last activity.",
        "Check-in tickets are deleted within a day. Security logs and reward click records are kept for up to 1 year.",
        "When you delete your account, your profile, answers, points, check-ins and rewards are deleted. Reward click counts are kept only without your identity.",
      ],
    },
    {
      heading: "6. Your rights",
      paras: [
        "You can ask to see the personal data we hold about you, correct it, or have it erased. You can withdraw any consent at any time. Withdrawing consent to the location check means you can't check in to play.",
        "You can delete your account yourself in More, then Me. For other requests, contact the Grievance Officer. You can also nominate someone to exercise your rights if you are unable to.",
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
        "SportsAura is only for people aged 21 and over. We do not knowingly collect data from anyone younger. If you believe someone under 21 has signed up, contact us and we will delete their account.",
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
