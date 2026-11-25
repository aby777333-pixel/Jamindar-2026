// Shared wishlist state (bug report 28-07): every heart in the app — listing
// cards, the property-detail header, the wishlist screen — reads and writes the
// same `favorites` rows through this hook, so saving from any screen shows
// everywhere. Uses the same insert/delete shape as the property-detail page.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./store";
import { logActivity } from "./audit";

export function useFavorites() {
  const { profile } = useAuth();
  const uid = profile?.id;
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["favorite-ids", uid],
    enabled: !!uid,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase.from("favorites").select("property_id").eq("buyer_id", uid!);
      return ((data ?? []) as { property_id: string }[]).map((r) => r.property_id);
    },
  });
  const ids = new Set(data ?? []);

  /** Invalidate every query that renders a heart or a wishlist. */
  function sync() {
    qc.invalidateQueries({ queryKey: ["favorite-ids"] });
    qc.invalidateQueries({ queryKey: ["favorite"] }); // property-detail heart
    qc.invalidateQueries({ queryKey: ["saved"] }); // My Wishlist screen
    qc.invalidateQueries({ queryKey: ["explorer"] }); // Saved-projects rail
    qc.invalidateQueries({ queryKey: ["promoter-dash"] }); // promoter Saved rail
  }

  async function toggle(propertyId: string) {
    if (!uid) return;
    // Report 25-11 (wishlist removal not reflected): flip the shared id list
    // at once so every heart and wishlist rail repaints immediately, and put
    // it back if the write is refused. The server write and the sync() below
    // are unchanged.
    const key = ["favorite-ids", uid];
    const wasSaved = ids.has(propertyId);
    qc.setQueryData<string[]>(key, (cur) => {
      const list = cur ?? [];
      return wasSaved ? list.filter((x) => x !== propertyId) : list.includes(propertyId) ? list : [...list, propertyId];
    });
    if (wasSaved) {
      const { error } = await supabase.from("favorites").delete().eq("buyer_id", uid).eq("property_id", propertyId);
      if (!error) logActivity("property_unsaved", { property_id: propertyId });
    } else {
      const { error } = await supabase.from("favorites").insert({ buyer_id: uid, property_id: propertyId });
      if (!error) logActivity("property_saved", { property_id: propertyId });
    }
    sync(); // refetch from the server: corrects the optimistic flip if a write failed
  }

  return { has: (id: string) => ids.has(id), toggle, sync, ready: data !== undefined };
}
