import type { ReactElement } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Empty } from "@/components/ui";
import { useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";

/**
 * Audit 29-07 (#7): every admin screen must refuse non-admins the way
 * activity.tsx and desk-contact.tsx already did — RLS protects the data, but a
 * deep link or stale nav stack still showed the full console chrome with
 * zeroed stats. Render the gate INSTEAD of the screen body when not an admin.
 *
 *   const gate = useAdminGate();
 *   if (gate) return gate;
 */
export function useAdminGate(): ReactElement | null {
  const { profile } = useAuth();
  if (profile?.role === "super_admin") return null;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <Empty title="Admins only" subtitle="This console is restricted to Jamin administrators." />
    </SafeAreaView>
  );
}
