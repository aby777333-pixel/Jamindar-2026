import { Text, View, FlatList, Pressable, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { logActivity } from "@/lib/audit";
import { colors, type as T } from "@/lib/theme";
import { formatINR, formatArea } from "@/lib/format";
import type { Property } from "@/lib/types";

/** Wishlist — every property the buyer hearted, with the ability to open or
 *  remove each one. Reachable from Account → My wishlist. */
export default function Saved() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["saved", profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<Property[]> => {
      const { data } = await supabase
        .from("favorites")
        .select("property:properties!favorites_property_id_fkey(*)")
        .eq("buyer_id", profile!.id)
        .order("created_at", { ascending: false });
      return ((data ?? []).map((r: any) => r.property).filter(Boolean)) as Property[];
    },
  });

  async function remove(p: Property) {
    if (!profile?.id) return;
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("buyer_id", profile.id)
      .eq("property_id", p.id);
    if (error) {
      Alert.alert("Couldn't remove", error.message);
      return;
    }
    logActivity("property_unsaved", { property_id: p.id });
    // keep the heart on the property detail page in sync
    qc.invalidateQueries({ queryKey: ["saved", profile.id] });
    qc.invalidateQueries({ queryKey: ["favorite"] });
  }

  function confirmRemove(p: Property) {
    Alert.alert("Remove from wishlist", `Remove "${p.title}" from your wishlist?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove(p) },
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
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>My Wishlist</Text>
          {count > 0 ? (
            <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
              {count} saved {count === 1 ? "property" : "properties"}
            </Text>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <Loading />
      ) : count > 0 ? (
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p }) => (
            <Pressable onPress={() => router.push(`/property/${p.id}`)}>
              <Card style={{ padding: 0, overflow: "hidden", flexDirection: "row", height: 108 }}>
                <View style={{ width: 100, height: "100%", backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                  {p.images?.[0] ? (
                    <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Ionicons name="business" size={24} color={colors.inkFaint} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0, padding: 12, justifyContent: "center" }}>
                  <Text style={{ fontWeight: "700", color: colors.ink }} numberOfLines={1}>{p.title}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {[p.locality, p.city].filter(Boolean).join(", ")}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                    <Text numberOfLines={1} style={{ color: colors.brand, fontWeight: "800", fontSize: 15 }}>
                      {formatINR(p.price)}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.inkFaint, fontSize: 12, flexShrink: 1, textAlign: "right" }}>
                      {formatArea(p.area_value, p.area_unit)}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => confirmRemove(p)}
                  hitSlop={8}
                  style={{ width: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="heart" size={22} color={colors.brand} />
                </Pressable>
              </Card>
            </Pressable>
          )}
        />
      ) : (
        <Empty title="No saved properties yet" subtitle="Tap the heart on any property to save it here for later." />
      )}
    </SafeAreaView>
  );
}
