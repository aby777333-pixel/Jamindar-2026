import { Text, View, FlatList, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, type as T } from "@/lib/theme";
import { formatINR } from "@/lib/format";

interface HeldPlot {
  id: string;
  ref: string;
  plot: string;
  amount: number | null;
  expires_at: string | null;
  created_at: string;
  property: { id: string; title: string; city: string | null; locality: string | null } | null;
}

/** Report 25-11: a buyer who put plots on hold in several projects had to
 *  revisit each project to find them. This lists every plot currently held in
 *  the signed-in member's name, with a way to open the project or give the
 *  plot back. Reachable from Account → My held plots. Read-only apart from the
 *  existing release_plot_hold call the plot sheet already uses. */
export default function Holds() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["my-holds", profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<HeldPlot[]> => {
      const { data } = await supabase
        .from("plot_holds")
        .select("id, ref, plot, amount, expires_at, created_at, property:properties(id, title, city, locality)")
        .eq("buyer_id", profile!.id)
        .eq("status", "held")
        .order("created_at", { ascending: false });
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        property: Array.isArray(r.property) ? r.property[0] ?? null : r.property ?? null,
      })) as HeldPlot[];
    },
  });

  async function withdraw(h: HeldPlot) {
    const { error } = await supabase.rpc("release_plot_hold", { p_hold: h.id });
    if (error) {
      Alert.alert("Could not withdraw the hold", error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["my-holds"] });
    qc.invalidateQueries({ queryKey: ["plot-hold"] });
    qc.invalidateQueries({ queryKey: ["properties"] });
    if (h.property?.id) qc.invalidateQueries({ queryKey: ["property", h.property.id] });
  }

  function confirmWithdraw(h: HeldPlot) {
    Alert.alert("Withdraw hold", `Give plot ${h.plot} back? It goes on sale again.`, [
      { text: "Keep hold", style: "cancel" },
      { text: "Withdraw", style: "destructive", onPress: () => withdraw(h) },
    ]);
  }

  const count = data?.length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>My held plots</Text>
          {count > 0 ? (
            <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
              {count} plot{count === 1 ? "" : "s"} on hold across your projects
            </Text>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <Loading />
      ) : count > 0 ? (
        <FlatList
          data={data}
          keyExtractor={(h) => h.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: h }) => (
            <Card style={{ gap: 6 }}>
              <Pressable onPress={() => h.property?.id && router.push(`/property/${h.property.id}`)}>
                <Text style={{ fontWeight: "700", color: colors.ink }} numberOfLines={1}>
                  {h.property?.title ?? "Project"}
                </Text>
                <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {[h.property?.locality, h.property?.city].filter(Boolean).join(", ")}
                </Text>
              </Pressable>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <Text style={{ color: colors.brand, fontWeight: "800" }}>Plot {h.plot}</Text>
                <Text style={{ color: colors.inkSoft, fontSize: 12 }}>Ref {h.ref}</Text>
              </View>
              <Text style={{ color: colors.inkSoft, fontSize: 12 }}>
                {h.amount ? `Hold amount ${formatINR(h.amount)} · ` : ""}
                {h.expires_at ? `Holds until ${new Date(h.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "No expiry set"}
              </Text>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
                <Pressable onPress={() => h.property?.id && router.push(`/property/${h.property.id}`)} hitSlop={6}>
                  <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>Open project</Text>
                </Pressable>
                <Pressable onPress={() => confirmWithdraw(h)} hitSlop={6}>
                  <Text style={{ color: colors.inkSoft, fontWeight: "700", fontSize: 13 }}>Withdraw hold</Text>
                </Pressable>
              </View>
            </Card>
          )}
        />
      ) : (
        <Empty title="No plots on hold" subtitle="Plots you hold while exploring a project are listed here, so you never have to search each project again." />
      )}
    </SafeAreaView>
  );
}
