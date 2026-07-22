import { useMemo, useState } from "react";
import { Text, View, Pressable, ScrollView, Image, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { formatINR, formatArea } from "@/lib/format";
import { PROPERTY_TYPE_LABELS, type Property, type PropertyType } from "@/lib/types";
import { decodeFilters, searchProperties, describeFilters, type SearchFilters } from "@/lib/property-search";
import { useCompare } from "@/lib/compare";

const FILTERS: { key: PropertyType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "residential_plot", label: "Plots" },
  { key: "villa_plot", label: "Villa Plots" },
  { key: "apartment", label: "Apartments" },
  { key: "house", label: "Houses" },
  { key: "farm_land", label: "Farm Land" },
  { key: "commercial_land", label: "Commercial" },
];

export default function Properties() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filters?: string }>();
  const jamindarFilters = useMemo<SearchFilters | null>(() => decodeFilters(params.filters), [params.filters]);
  const [filter, setFilter] = useState<PropertyType | "all">("all");
  const [search, setSearch] = useState("");
  const compareCount = useCompare((s) => s.ids.length);

  const { data, isLoading } = useQuery({
    queryKey: ["properties", filter, params.filters ?? ""],
    queryFn: async (): Promise<Property[]> => {
      // If Jamindar passed structured filters, honour them exactly.
      if (jamindarFilters) return searchProperties(jamindarFilters);
      let q = supabase
        .from("properties")
        .select("*")
        .in("status", ["available", "reserved", "sold"])
        .order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("property_type", filter);
      const { data } = await q;
      return (data as Property[]) ?? [];
    },
  });

  const list = (data ?? []).filter((p) => {
    if (!search.trim()) return true;
    const hay = `${p.title} ${p.city} ${p.locality} ${p.district} ${p.state}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: "800", color: colors.ink }}>Jamin Properties</Text>
            <Text style={{ color: colors.inkFaint, marginTop: 2 }}>Company-owned lands & plots</Text>
          </View>
          {compareCount > 0 ? (
            <Pressable
              onPress={() => router.push("/tools/compare")}
              style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }}
            >
              <Ionicons name="git-compare" size={15} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Compare {compareCount}</Text>
            </Pressable>
          ) : null}
        </View>

        {jamindarFilters ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: colors.brandSoft,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginTop: 12,
            }}
          >
            <Ionicons name="sparkles" size={16} color={colors.brand} />
            <Text style={{ flex: 1, color: colors.brand, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>
              Jamindar: {describeFilters(jamindarFilters)}
            </Text>
            <Pressable onPress={() => router.replace("/(tabs)/properties")}>
              <Ionicons name="close-circle" size={18} color={colors.brand} />
            </Pressable>
          </View>
        ) : null}

        {/* search */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 14,
            marginTop: 14,
          }}
        >
          <Ionicons name="search" size={18} color={colors.inkFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by city, locality…"
            placeholderTextColor={colors.inkFaint}
            style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, color: colors.ink }}
          />
        </View>
      </View>

      {/* filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 14, maxHeight: 44 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: filter === f.key ? colors.brand : colors.surface,
              borderWidth: 1,
              borderColor: filter === f.key ? colors.brand : colors.border,
            }}
          >
            <Text style={{ color: filter === f.key ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 13 }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title="No properties found" subtitle="Try a different filter or search term." />
      ) : (
        <ScrollView
          style={{ flex: 1, marginTop: 14 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110, gap: 14 }}
          showsVerticalScrollIndicator={false}
        >
          {list.map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/property/${p.id}`)}>
              <Card style={{ padding: 0, overflow: "hidden", flexDirection: "row" }}>
                <View style={{ width: 110, backgroundColor: colors.surfaceSunken }}>
                  {p.images?.[0] ? (
                    <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 110 }}>
                      <Ionicons name="image" size={28} color={colors.inkFaint} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, padding: 12 }}>
                  <Text style={{ fontWeight: "700", color: colors.ink }} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {[p.locality, p.city, p.state].filter(Boolean).join(", ")}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                    <Tag>{PROPERTY_TYPE_LABELS[p.property_type]}</Tag>
                    {p.status === "sold" ? <Tag tone="muted">Sold</Tag> : null}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                    <Text style={{ color: colors.brand, fontWeight: "800" }}>{formatINR(p.price)}</Text>
                    <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
                      {formatArea(p.area_value, p.area_unit)}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Tag({ children, tone = "brand" }: { children: string; tone?: "brand" | "muted" }) {
  return (
    <View
      style={{
        backgroundColor: tone === "brand" ? colors.brandSoft : colors.surfaceSunken,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
      }}
    >
      <Text style={{ color: tone === "brand" ? colors.brand : colors.inkFaint, fontSize: 11, fontWeight: "600" }}>
        {children}
      </Text>
    </View>
  );
}
