import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, type as T } from "@/lib/theme";
import { encodeFilters } from "@/lib/property-search";
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/lib/types";

const TYPE_EMOJI: Record<PropertyType, string> = {
  farm_land: "🌾",
  residential_plot: "🏘️",
  villa_plot: "🏡",
  apartment: "🏢",
  house: "🏠",
  commercial_land: "🏬",
  industrial_land: "🏭",
};

const TYPE_BLURB: Record<PropertyType, string> = {
  farm_land: "Agricultural land & farmland parcels",
  residential_plot: "DTCP/CMDA-approved house plots",
  villa_plot: "Gated villa plots with amenities",
  apartment: "Ready and under-construction flats",
  house: "Independent houses and bungalows",
  commercial_land: "Shops, offices and retail frontage",
  industrial_land: "Warehousing and industrial parcels",
};

const ORDER: PropertyType[] = [
  "residential_plot",
  "villa_plot",
  "farm_land",
  "apartment",
  "house",
  "commercial_land",
  "industrial_land",
];

/** All land & property categories with live counts.
 *  Destination for Home → Types of Lands → "See all". */
export default function LandTypes() {
  const router = useRouter();

  const { data: counts, isLoading } = useQuery({
    queryKey: ["land-type-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data } = await supabase
        .from("properties")
        .select("property_type")
        .in("status", ["available", "reserved", "sold"]);
      const out: Record<string, number> = {};
      for (const r of (data as { property_type: PropertyType }[]) ?? []) {
        out[r.property_type] = (out[r.property_type] ?? 0) + 1;
      }
      return out;
    },
  });

  function openType(type: PropertyType) {
    router.navigate({ pathname: "/(tabs)/properties", params: { filters: encodeFilters({ types: [type] }) } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Types of Lands</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Browse by category</Text>
        </View>
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }} showsVerticalScrollIndicator={false}>
          {ORDER.map((t) => {
            const n = counts?.[t] ?? 0;
            return (
              <Pressable key={t} onPress={() => openType(t)}>
                <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 26 }}>{TYPE_EMOJI[t]}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 15 }} numberOfLines={1}>
                      {PROPERTY_TYPE_LABELS[t]}
                    </Text>
                    <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {TYPE_BLURB[t]}
                    </Text>
                    <Text style={{ color: n > 0 ? colors.brand : colors.inkFaint, fontSize: 12, fontWeight: "700", marginTop: 5 }}>
                      {n > 0 ? `${n} ${n === 1 ? "listing" : "listings"}` : "None listed yet"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
