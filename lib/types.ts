export type UserRole = "super_admin" | "promoter" | "buyer";

export type PropertyType =
  | "residential_plot"
  | "villa_plot"
  | "apartment"
  | "house"
  | "farm_land"
  | "commercial_land"
  | "industrial_land";

export type PropertyStatus =
  | "draft"
  | "available"
  | "reserved"
  | "sold"
  | "archived";

export type ProjectPhase = "ongoing" | "current" | "future";

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
export type VisitStatus = "requested" | "confirmed" | "completed" | "cancelled";

export type KycStatus = "not_started" | "pending" | "approved" | "rejected";
export type PartnerStatus = "none" | "eligible" | "pending" | "verified" | "rejected";

/** How a user first entered the Jamin ecosystem (captured for analytics). */
export type AcquisitionSource =
  | "promoter_referral"
  | "friend_referral"
  | "property_link"
  | "qr"
  | "social_ad"
  | "google_search"
  | "website"
  | "organic";

export interface Profile {
  id: string;
  mobile: string;
  full_name: string | null;
  role: UserRole;
  email: string | null;
  avatar_url: string | null;
  preferred_language: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  assigned_promoter: string | null;
  is_active: boolean;
  is_profile_complete: boolean;
  created_at: string;
  last_login: string | null;
  // ── buyer-module foundation (migration 0006) ──
  member_code: string | null;         // permanent Buyer/Promoter ID, e.g. JA000001
  gender: string | null;
  dob: string | null;
  acquisition_source: AcquisitionSource | null;
  acquisition_meta: Record<string, unknown>;
  referred_by: string | null;
  referral_code: string | null;       // personal referral code, e.g. JA-REF-00001
  kyc_status: KycStatus;
  partner_status: PartnerStatus;
  partner_code: string | null;
  partner_verified_at: string | null;
}

export const KYC_STATUS_META: Record<KycStatus, { label: string; tone: "neutral" | "warning" | "success" | "danger"; icon: string }> = {
  not_started: { label: "KYC not started", tone: "neutral", icon: "shield-outline" },
  pending: { label: "KYC pending review", tone: "warning", icon: "time-outline" },
  approved: { label: "KYC verified", tone: "success", icon: "shield-checkmark" },
  rejected: { label: "KYC rejected", tone: "danger", icon: "close-circle-outline" },
};

export interface KycSubmission {
  id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  pan_number: string | null;
  aadhaar_number: string | null;
  pan_doc: string | null;
  aadhaar_front: string | null;
  aadhaar_back: string | null;
  addr_house: string | null;
  addr_street: string | null;
  addr_landmark: string | null;
  addr_area: string | null;
  addr_city: string | null;
  addr_district: string | null;
  addr_state: string | null;
  addr_country: string | null;
  addr_pincode: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_proof: string | null;
  upi_id: string | null;
  nominee_name: string | null;
  nominee_relationship: string | null;
  nominee_phone: string | null;
  nominee_email: string | null;
  nominee_address: string | null;
  nominee_pan: string | null;
  nominee_aadhaar: string | null;
  nominee_pan_doc: string | null;
  nominee_aadhaar_front: string | null;
  nominee_aadhaar_back: string | null;
  reviewed_by: string | null;
  review_reason: string | null;
  review_corrections: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface Property {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  property_type: PropertyType;
  status: PropertyStatus;
  project_phase: ProjectPhase;
  price: number | null;
  price_unit: string | null;
  area_value: number | null;
  area_unit: string | null;
  plots_total: number | null;
  plots_available: number | null;
  city: string | null;
  district: string | null;
  state: string | null;
  locality: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  gmaps_url: string | null;
  amenities: string[];
  approvals: Record<string, boolean>;
  vastu_facing: string | null;
  images: string[];
  videos: string[];
  virtual_tour_url: string | null;
  brochure_url: string | null;
  nearby_landmarks: { label: string; distance?: string }[];
  promoter_id: string | null;
  is_featured: boolean;
  created_at: string;
  // ── property experience (migration 0010) ──
  master_plan_url: string | null;
  plot_layout: { plot_no: string; status?: string }[];
  documents: { label: string; url: string; size?: string }[];
  drone_videos: string[];
  rera_number: string | null;
  legal: { ownership?: string; encumbrance?: string; notes?: string } & Record<string, unknown>;
  investment: {
    roi?: string | number;
    rental_yield?: string | number;
    appreciation?: string;
    price_history?: { label: string; value: number }[];
  } & Record<string, unknown>;
  street_view_url: string | null;
  google_earth_url: string | null;
  nearby_places: { category?: string; name: string; distance?: string; duration?: string }[];
  tab_config: { order?: string[]; hidden?: string[] };
  // ── project + referral economics (migration 0014) ──
  project_name: string | null;
  location_text: string | null;
  nearby_defaults: Record<string, string>;
  referral_direct_per_sqft: number | null;
  referral_indirect_per_sqft: number | null;
  referral_indirect_levels: number | null;
  total_project_value: number | null;
}

/** Standard nearby landmarks captured for every project. */
export const NEARBY_DEFAULTS: { key: string; label: string }[] = [
  { key: "bus_stand", label: "Bus stand" },
  { key: "railway_station", label: "Railway station" },
  { key: "school", label: "School" },
  { key: "college", label: "College" },
  { key: "hospital", label: "Hospital" },
];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  residential_plot: "Residential Plot",
  villa_plot: "Villa Plot",
  apartment: "Apartment",
  house: "House",
  farm_land: "Farm Land",
  commercial_land: "Commercial Land",
  industrial_land: "Industrial Land",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  promoter: "Promoter",
  buyer: "Buyer",
};
