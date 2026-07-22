import { Text, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Empty, Loading, Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useCompare } from "@/lib/compare";
import { colors } from "@/lib/theme";
import { formatINR, formatArea } from "@/lib/format";
import { PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

export default function Compare() {
  const router = useRouter();
  const { ids, remove, clear } = useCompare();

  const { data, isLoading } = useQuery({
    queryKey: ["compare", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Property[]> => {
      const { data } = await supabase.from("properties").select("*").in("id", ids);
      const rows = (data as Property[]) ?? [];
      // preserve selection order
      return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as Property[];
    },
  });

  const rows: { label: string; get: (p: Property) => string }[] = [
    { label: "Type", get: (p) => PROPERTY_TYPE_LABELS[p.property_type] },
    { label: "Price", get: (p) => formatINR(p.price) },
    { label: "Area", get: (p) => formatArea(p.area_value, p.area_unit) },
    { label: "City", get: (p) => p.city ?? "—" },
    { label: "Locality", get: (p) => p.locality ?? "—" },
    { label: "Facing", get: (p) => p.vastu_facing ?? "—" },
    { label: "Plots left", get: (p) => (p.plots_available != null ? `${p.plots_available}/${p.plots_total}` : "—") },
    { label: "Approvals", get: (p) => Object.entries(p.approvals ?? {}).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(", ") || "—" },
    { label: "Amenities", get: (p) => String(p.amenities?.length ?? 0) },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink, flex: 1 }}>Compare</Text>
        {ids.length > 0 ? (
          <Pressable onPress={clear}>
            <Text style={{ color: colors.brand, fontWeight: "700" }}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {ids.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Empty title="Nothing to compare yet" subtitle="Open a property and tap 'Add to Compare' — pick up to 3." />
          <View style={{ paddingHorizontal: 40, marginTop: 8 }}>
            <Button label="Browse Properties" onPress={() => router.replace("/(tabs)/properties")} />
          </View>
        </View>
      ) : isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* header row: property titles */}
              <View style={{ flexDirection: "row" }}>
                <View style={{ width: 96 }} />
                {(data ?? []).map((p) => (
                  <View key={p.id} style={{ width: 150, padding: 8 }}>
                    <Pressable onPress={() => remove(p.id)} style={{ alignSelf: "flex-end" }}>
                      <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
                    </Pressable>
                    <Pressable onPress={() => router.push(`/property/${p.id}`)}>
                      <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 13 }} numberOfLines={2}>
                        {p.title}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              {rows.map((r, ri) => (
                <View
                  key={r.label}
                  style={{ flexDirection: "row", backgroundColor: ri % 2 === 0 ? colors.surface : "transparent", borderRadius: 8 }}
                >
                  <View style={{ width: 96, padding: 10, justifyContent: "center" }}>
                    <Text style={{ color: colors.inkFaint, fontSize: 12, fontWeight: "600" }}>{r.label}</Text>
                  </View>
                  {(data ?? []).map((p) => (
                    <View key={p.id} style={{ width: 150, padding: 10 }}>
                      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: r.label === "Price" ? "800" : "500" }}>
                        {r.get(p)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
