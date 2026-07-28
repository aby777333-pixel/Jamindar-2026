// Jamindar Sales & Customer-Success module (owner spec 2026-07-28).
// Everything here works ONLY from the live properties table — no hardcoded
// project names, prices or links anywhere. The chat brain gets the same
// inventory server-side (jamindar-voice v13); this client half fetches the
// pool for the rich in-chat cards, ranks alternatives when a search comes up
// empty, and matches which live projects a reply actually mentioned.
import { supabase } from "./supabase";
import type { Property } from "./types";
import type { SearchFilters } from "./property-search";

/** Sellable live inventory, featured first. Sold projects are never recommended. */
export async function fetchLiveInventory(limit = 12): Promise<Property[]> {
  const { data } = await supabase
    .from("properties")
    .select("*")
    .in("status", ["available", "reserved"])
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Property[]) ?? [];
}

/**
 * Rank the pool against what the user asked for — closest budget first, then
 * preferred city/locality, property type, and generally attractive projects
 * (featured, ready/ongoing before upcoming). Pure + deterministic.
 */
export function rankAlternatives(pool: Property[], filters?: SearchFilters): Property[] {
  const city = filters?.city?.toLowerCase();
  const types = filters?.types ?? [];
  const budget = filters?.budgetMax ?? filters?.budgetMin;

  const score = (p: Property): number => {
    let s = 0;
    if (p.is_featured) s += 2;
    if (p.project_phase === "current") s += 2;
    else if (p.project_phase === "ongoing") s += 1;
    if (city && (p.city?.toLowerCase().includes(city) || p.district?.toLowerCase().includes(city) || p.locality?.toLowerCase().includes(city))) s += 4;
    if (types.length && types.includes(p.property_type)) s += 3;
    if (budget && p.price) {
      const ratio = Number(p.price) / budget;
      if (ratio <= 1) s += 3; // inside budget
      else if (ratio <= 1.25) s += 2; // slight stretch — upsell territory
      else if (ratio <= 1.6) s += 1;
    } else if (budget && !p.price) {
      s += 1; // price-on-request keeps the door open
    }
    return s;
  };

  return [...pool].sort((a, b) => score(b) - score(a));
}

/**
 * Which live projects does this assistant reply actually mention?
 * Matched case-insensitively on the project title / project_name so cards are
 * only attached for real, current inventory the model was given.
 */
export function matchMentionedProjects(reply: string, pool: Property[]): Property[] {
  // Token-based, punctuation-insensitive: the model writes names naturally
  // ("Jamin Garden in Edappadi" for the title "Jamin Garden — Edappadi"), so a
  // project matches when EVERY word of its name appears in the reply.
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const text = ` ${norm(reply)} `;
  const seen = new Set<string>();
  const out: Property[] = [];
  for (const p of pool) {
    const names = [p.title, (p as { project_name?: string | null }).project_name].filter(
      (n): n is string => !!n && n.trim().length >= 5,
    );
    const mentioned = names.some((name) => {
      const tokens = norm(name).split(" ").filter((t) => t.length >= 2);
      return tokens.length > 0 && tokens.every((t) => text.includes(` ${t} `));
    });
    if (mentioned && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/** Human status label for the card chip — mirrors the phase names used app-wide. */
export function phaseLabel(p: Property): string {
  switch (p.project_phase) {
    case "current":
      return "Ready to move";
    case "ongoing":
      return "Ongoing";
    case "future":
      return "Upcoming";
    case "completed":
      return "Completed";
    default:
      return "Live";
  }
}
