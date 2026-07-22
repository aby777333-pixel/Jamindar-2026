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

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
export type VisitStatus = "requested" | "confirmed" | "completed" | "cancelled";

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
}

export interface Property {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  property_type: PropertyType;
  status: PropertyStatus;
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
}

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
