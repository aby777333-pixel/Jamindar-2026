import { supabase } from "./supabase";
import { PROPERTY_TYPE_LABELS, type Property, type PropertyType } from "./types";

export interface SearchFilters {
  types?: PropertyType[];
  city?: string;
  budgetMin?: number;
  budgetMax?: number;
  amenities?: string[]; // canonical amenity strings that must be present
  approvals?: string[]; // 'dtcp' | 'cmda' | 'rera'
  facing?: string; // 'East' | 'North' | ...
  loanEligible?: boolean;
}

// word -> property_type enum
const TYPE_WORDS: { re: RegExp; type: PropertyType }[] = [
  { re: /\bresidential plot|house plot\b/i, type: "residential_plot" },
  { re: /\bvilla plot|villa\b/i, type: "villa_plot" },
  { re: /\bapartment|flat\b/i, type: "apartment" },
  { re: /\bindependent house|house\b/i, type: "house" },
  { re: /\bfarm ?land|farm\b/i, type: "farm_land" },
  { re: /\bagricultur/i, type: "farm_land" },
  { re: /\bcommercial\b/i, type: "commercial_land" },
  { re: /\bindustrial\b/i, type: "industrial_land" },
  { re: /\bplots?\b/i, type: "residential_plot" }, // generic "plots"
];

// query phrase -> canonical amenity string (must match seeded amenity values)
const AMENITY_WORDS: { re: RegExp; amenity: string }[] = [
  { re: /\btemple/i, amenity: "Temple Nearby" },
  { re: /\bschool/i, amenity: "School Nearby" },
  { re: /\bhospital/i, amenity: "Hospital Nearby" },
  { re: /\bmetro/i, amenity: "Metro Nearby" },
  { re: /\bcorner plot|corner\b/i, amenity: "Corner Plot" },
  { re: /\bpark facing|park\b/i, amenity: "Park Facing" },
  { re: /\blake ?view|lake\b/i, amenity: "Lake View" },
  { re: /\bgated\b/i, amenity: "Gated Community" },
  { re: /\bmain road\b/i, amenity: "Main Road" },
  { re: /\bhighway\b/i, amenity: "Highway Access" },
  { re: /\bwater\b/i, amenity: "Water Supply" },
  { re: /\belectricity|power\b/i, amenity: "Electricity" },
];

const KNOWN_CITIES = ["chennai", "bengaluru", "bangalore", "hyderabad", "coimbatore", "mumbai", "pune", "delhi", "kochi", "madurai"];

function parseBudget(text: string): { min?: number; max?: number } {
  const t = text.toLowerCase();
  const unit = (u: string) => (/(cr|crore)/.test(u) ? 1e7 : /(l|lakh|lac)/.test(u) ? 1e5 : 1);
  // between X and Y
  const between = t.match(/between\s*([\d.]+)\s*(cr|crore|l|lakh|lac)?\s*(?:and|to|-)\s*([\d.]+)\s*(cr|crore|l|lakh|lac)?/);
  if (between) {
    const min = parseFloat(between[1]) * unit(between[2] ?? between[4] ?? "l");
    const max = parseFloat(between[3]) * unit(between[4] ?? "l");
    return { min, max };
  }
  const under = t.match(/(?:under|below|less than|upto|up to|max(?:imum)?)\s*([\d.]+)\s*(cr|crore|l|lakh|lac)?/);
  if (under) return { max: parseFloat(under[1]) * unit(under[2] ?? "l") };
  const above = t.match(/(?:above|over|more than|min(?:imum)?|starting)\s*([\d.]+)\s*(cr|crore|l|lakh|lac)?/);
  if (above) return { min: parseFloat(above[1]) * unit(above[2] ?? "l") };
  return {};
}

export function parseSearchQuery(text: string): SearchFilters {
  const f: SearchFilters = {};
  const t = text.toLowerCase();

  const types = new Set<PropertyType>();
  for (const { re, type } of TYPE_WORDS) if (re.test(t)) types.add(type);
  if (types.size) f.types = [...types];

  const amenities = new Set<string>();
  for (const { re, amenity } of AMENITY_WORDS) if (re.test(t)) amenities.add(amenity);
  if (amenities.size) f.amenities = [...amenities];

  const approvals: string[] = [];
  if (/\bdtcp\b/i.test(t)) approvals.push("dtcp");
  if (/\bcmda\b/i.test(t)) approvals.push("cmda");
  if (/\brera\b/i.test(t)) approvals.push("rera");
  if (approvals.length) f.approvals = approvals;

  if (/\beast facing|east\b/i.test(t)) f.facing = "East";
  else if (/\bnorth facing|north\b/i.test(t)) f.facing = "North";

  if (/\bloan eligible|loan\b/i.test(t)) f.loanEligible = true;

  const city = KNOWN_CITIES.find((c) => t.includes(c));
  if (city) f.city = city === "bangalore" ? "Bengaluru" : city.charAt(0).toUpperCase() + city.slice(1);

  const b = parseBudget(t);
  if (b.min) f.budgetMin = b.min;
  if (b.max) f.budgetMax = b.max;

  return f;
}

/** True if the utterance carries real search filters (not just "open properties"). */
export function hasSearchFilters(f: SearchFilters): boolean {
  return !!(f.types || f.city || f.budgetMin || f.budgetMax || f.amenities || f.approvals || f.facing);
}

export async function searchProperties(f: SearchFilters): Promise<Property[]> {
  let q = supabase.from("properties").select("*").in("status", ["available", "reserved", "sold"]);
  if (f.types?.length) q = q.in("property_type", f.types);
  if (f.city) q = q.ilike("city", `%${f.city}%`);
  if (f.budgetMax) q = q.lte("price", f.budgetMax);
  if (f.budgetMin) q = q.gte("price", f.budgetMin);
  if (f.facing) q = q.ilike("vastu_facing", `%${f.facing}%`);
  if (f.amenities?.length) q = q.contains("amenities", f.amenities);
  if (f.approvals?.length) {
    for (const a of f.approvals) q = q.contains("approvals", { [a]: true });
  }
  q = q.order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(30);
  const { data } = await q;
  return (data as Property[]) ?? [];
}

export function describeFilters(f: SearchFilters): string {
  const parts: string[] = [];
  if (f.approvals?.length) parts.push(f.approvals.map((a) => a.toUpperCase()).join("/") + "-approved");
  if (f.facing) parts.push(`${f.facing}-facing`);
  if (f.types?.length) parts.push(f.types.map((t) => PROPERTY_TYPE_LABELS[t]).join("/"));
  else parts.push("properties");
  if (f.amenities?.length) parts.push("with " + f.amenities.join(", ").toLowerCase());
  if (f.city) parts.push(`in ${f.city}`);
  if (f.budgetMax) parts.push(`under ₹${f.budgetMax >= 1e7 ? f.budgetMax / 1e7 + " Cr" : f.budgetMax / 1e5 + " L"}`);
  return parts.join(" ");
}

// serialize filters for router params
export function encodeFilters(f: SearchFilters): string {
  return JSON.stringify(f);
}
export function decodeFilters(s?: string | string[]): SearchFilters | null {
  const raw = Array.isArray(s) ? s[0] : s;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SearchFilters;
  } catch {
    return null;
  }
}
