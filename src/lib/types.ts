export type BgType = "solid" | "gradient" | "image";
export type MatchStatus = "scheduled" | "live" | "ended";
export type QuestionStatus = "draft" | "live" | "locked" | "resolved" | "void";
export type StaffRole = "admin" | "game_master" | "venue_manager";
export type CodeMode = "none" | "static" | "unique";

export interface Theme {
  id: string;
  name: string;
  bg_type: BgType;
  bg_value: string;
  primary_color: string;
  secondary_color: string;
  text_color: string;
  surface_color: string;
  logo_url: string | null;
  sponsor_name: string | null;
}

export interface Venue {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string;
  geofence_radius_m: number;
  default_theme_id: string | null;
  is_active: boolean;
  lat?: number;
  lng?: number;
  table_count?: number;
}

export interface Match {
  id: string;
  title: string;
  sport: string;
  starts_at: string;
  status: MatchStatus;
  theme_id: string | null;
  reward_set_id?: string | null;
  sponsor_id?: string | null;
  current_over?: number | null;
}

export type RewardRule = "random" | "first_correct" | "every_n_correct";

export interface RewardSet {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface Question {
  id: string;
  match_id: string;
  venue_id: string | null;
  prompt: string;
  options: string[];
  correct_option: number | null;
  points: number;
  coupon_bucket_id: string | null;
  answer_window_s: number;
  status: QuestionStatus;
  pushed_at: string | null;
  locks_at: string | null;
  resolved_at: string | null;
  created_at: string;
  sponsor_id?: string | null;
}

export interface Bucket {
  id: string;
  brand_name: string;
  logo_url: string | null;
  title: string;
  description: string | null;
  terms: string | null;
  is_alcohol: boolean;
  min_age: 21 | 25;
  code_mode: CodeMode;
  total_quantity: number | null;
  issued_count: number;
  valid_until: string | null;
  is_active: boolean;
  has_link: boolean;
  set_id?: string | null;
  set_position?: number | null;
  rule?: RewardRule;
  rule_n?: number | null;
}

export interface WalletCoupon {
  id: string;
  code: string | null;
  issued_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  question_id: string | null;
  coupon_buckets: Pick<
    Bucket,
    "brand_name" | "logo_url" | "title" | "description" | "terms" | "is_alcohol" | "min_age" | "has_link"
  >;
}

export interface Profile {
  id: string;
  display_name: string;
  age_verified_21: boolean;
  age_verified_25: boolean;
  consent_agreed_at: string;
  marketing_consent_at: string | null;
}

export interface Banner {
  id: string;
  venue_id: string | null;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
}

export interface LeaderRow {
  rank: number;
  display_name: string;
  venue_name: string;
  points: number;
  is_me: boolean;
}

export const BUCKET_PUBLIC_COLUMNS =
  "brand_name, logo_url, title, description, terms, is_alcohol, min_age, has_link";

export interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  tagline: string | null;
  link_url: string | null;
  is_active: boolean;
}

export interface QuestionTemplate {
  id: string;
  pack: string;
  sport: string;
  prompt: string;
  options: string[];
  points: number;
  answer_window_s: number;
  sort_order: number;
  is_active: boolean;
}

export interface Season {
  id: string;
  name: string;
  city: string;
  starts_on: string;
  ends_on: string;
  prize_text: string | null;
  prize_terms_url: string | null;
  sponsor_id: string | null;
  is_active: boolean;
}

export type VenuePlan = "pilot" | "season" | "per_reward";
export type BillingStatus = "pending" | "trial" | "active" | "past_due" | "cancelled";

export interface VenueAccount {
  venue_id: string;
  plan: VenuePlan;
  status: BillingStatus;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  gstin: string | null;
  paid_until: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
}

/** "Mumbai vs Chennai" -> ["Mumbai", "Chennai"] for {home}/{away} in question packs. */
export function sides(title: string): [string, string] {
  const parts = title.split(/\s+(?:vs\.?|v)\s+/i);
  return parts.length === 2 ? [parts[0].trim(), parts[1].trim()] : ["Home", "Away"];
}

export function fillTemplate(text: string, title: string, over: number): string {
  const [home, away] = sides(title);
  return text.replaceAll("{over}", String(over)).replaceAll("{home}", home).replaceAll("{away}", away);
}
