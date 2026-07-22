import { supabase } from "./supabase";
import type { SearchFilters } from "./property-search";
import type { PropertyType } from "./types";

export type SuggestionAction =
  | { type: "properties"; filters?: SearchFilters }
  | { type: "visits" }
  | { type: "checklist" };

export interface Suggestion {
  key: string;
  icon: string;
  tone: "brand" | "gold" | "green" | "blue";
  title: string;
  subtitle: string;
  action: SuggestionAction;
}

const BUYING_CHECKLIST = [
  "Verify Patta / title & parent documents",
  "Check the Encumbrance Certificate (EC) for dues",
  "Confirm DTCP / CMDA / RERA approval",
  "Match the FMB sketch & survey number on site",
  "Budget stamp duty + registration (~8%)",
  "Get a legal opinion before advance payment",
];

/** Compute proactive suggestions from real data only (no fabricated forecasts). */
export async function computeSuggestions(userId: string): Promise<Suggestion[]> {
  const out: Suggestion[] = [];

  // 1) upcoming site visits
  try {
    const { data: visits } = await supabase
      .from("site_visits")
      .select("id, status")
      .eq("buyer_id", userId)
      .in("status", ["requested", "confirmed"])
      .limit(5);
    if (visits && visits.length > 0) {
      out.push({
        key: "visits",
        icon: "calendar",
        tone: "brand",
        title: `${visits.length} site ${visits.length === 1 ? "visit" : "visits"} in progress`,
        subtitle: "Tap to review your visit requests",
        action: { type: "visits" },
      });
    }
  } catch {
    /* ignore */
  }

  // 2) new matches for saved preferences
  try {
    const { data: prefs } = await supabase
      .from("buyer_preferences")
      .select("*")
      .eq("buyer_id", userId)
      .maybeSingle();
    if (prefs) {
      const filters: SearchFilters = {
        types: (prefs.property_types as PropertyType[]) ?? undefined,
        city: prefs.city ?? undefined,
        budgetMax: prefs.budget_max ?? undefined,
        budgetMin: prefs.budget_min ?? undefined,
      };
      if (filters.types?.length || filters.city || filters.budgetMax) {
        let q = supabase.from("properties").select("id", { count: "exact", head: true }).in("status", ["available", "reserved"]);
        if (filters.types?.length) q = q.in("property_type", filters.types);
        if (filters.city) q = q.ilike("city", `%${filters.city}%`);
        if (filters.budgetMax) q = q.lte("price", filters.budgetMax);
        if (filters.budgetMin) q = q.gte("price", filters.budgetMin);
        const { count } = await q;
        if ((count ?? 0) > 0) {
          out.push({
            key: "matches",
            icon: "options",
            tone: "green",
            title: `${count} ${count === 1 ? "property matches" : "properties match"} your preferences`,
            subtitle: "See the ones picked for you",
            action: { type: "properties", filters },
          });
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 3) almost sold out
  try {
    const { data: props } = await supabase
      .from("properties")
      .select("title, plots_available, plots_total")
      .in("status", ["available", "reserved"])
      .limit(50);
    const scarce = (props ?? []).filter(
      (p: any) => p.plots_total > 0 && p.plots_available != null && p.plots_available / p.plots_total <= 0.35
    );
    if (scarce.length > 0) {
      out.push({
        key: "scarce",
        icon: "flame",
        tone: "gold",
        title: `Selling fast: ${scarce.length} ${scarce.length === 1 ? "project" : "projects"} almost sold out`,
        subtitle: "Limited plots remaining — act soon",
        action: { type: "properties" },
      });
    }
  } catch {
    /* ignore */
  }

  // 4) new launches (featured)
  try {
    const { count } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("is_featured", true)
      .in("status", ["available", "reserved"]);
    if ((count ?? 0) > 0) {
      out.push({
        key: "launch",
        icon: "sparkles",
        tone: "blue",
        title: `${count} featured ${count === 1 ? "launch" : "launches"} available`,
        subtitle: "Explore our newest projects",
        action: { type: "properties" },
      });
    }
  } catch {
    /* ignore */
  }

  // 5) buying checklist (always useful, informational)
  out.push({
    key: "checklist",
    icon: "checkbox",
    tone: "brand",
    title: "Your pre-purchase checklist",
    subtitle: "6 things to verify before you buy",
    action: { type: "checklist" },
  });

  return out;
}

export function checklistText(): string {
  return BUYING_CHECKLIST.map((c, i) => `${i + 1}. ${c}`).join("\n");
}
