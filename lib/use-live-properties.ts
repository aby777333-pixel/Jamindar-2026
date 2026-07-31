import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "./supabase";

/**
 * Keep property lists in step with the admin console.
 *
 * The property *detail* screen already subscribes to its own row, so a price
 * or plot change made in admin repaints there. The lists did not subscribe at
 * all, so a member sitting on Home or Properties kept seeing the old price
 * until the screen happened to remount — which reads as "admin changes don't
 * reach the app" (owner report, 2026-07-31).
 *
 * `properties` is already in the supabase_realtime publication, so nothing has
 * to be enabled for this. INSERT and DELETE matter as much as UPDATE: adding
 * or removing a listing should not need an app restart either.
 *
 * The channel name is generated per mount. A fixed name collides when two
 * screens mount at once and the second subscribe is silently dropped.
 */
export function useLiveProperties(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`properties-list-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "properties" }, () => {
        qc.invalidateQueries({ queryKey: ["properties"] });
        qc.invalidateQueries({ queryKey: ["featured-properties"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
