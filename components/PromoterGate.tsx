import type { ReactElement } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Empty, Button } from "@/components/ui";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { colors, space } from "@/lib/theme";

/**
 * Owner directive 05-08: "buyer and promoter are two different beings — do not
 * mix." The promoter workspace had no gate at all, so a buyer arriving by deep
 * link, notification or a stale nav stack was shown the promoter dashboard,
 * earnings, tree and lead desk — all reading zero, because RLS correctly gave
 * them nothing. Wrong workspace, wrong identity.
 *
 * Mirrors {@link useAdminGate}: call it AFTER every hook in the screen, then
 * return it instead of the body.
 *
 *   const gate = usePromoterGate();
 *   if (gate) return gate;
 *
 * Keyed off the EFFECTIVE role, so a super admin reaches every workspace by
 * default but is held to the same walls while previewing a role — otherwise
 * the preview would not show what that role actually sees. A buyer is shown
 * the way in rather than a dead end, because becoming a promoter is self-serve.
 */
export function usePromoterGate(): ReactElement | null {
  const router = useRouter();
  const role = useEffectiveRole();
  const loading = useAuth((s) => s.loading);

  // Never flash "promoters only" at a promoter whose profile is still loading.
  if (loading) return null;
  if (role === "promoter" || role === "super_admin") return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <Empty
        icon="briefcase-outline"
        title="For Jamin Promoters"
        subtitle="This is the promoter workspace. Your buyer account keeps its own dashboard, wishlist and site visits."
      />
      <View style={{ paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.sm }}>
        <Button label="Become a promoter" onPress={() => router.replace("/become-promoter" as Href)} />
        <Button label="Back to my dashboard" variant="ghost" onPress={() => router.replace("/buyer/dashboard" as Href)} />
      </View>
    </SafeAreaView>
  );
}
