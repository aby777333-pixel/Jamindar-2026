import { useState } from "react";
import { Text, View, ScrollView, Pressable, TextInput, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Loading, Empty } from "@/components/ui";
import { VerifiedListingCard } from "@/components/land";
import { PromoterSection, SoftEmpty } from "@/components/promoter";
import { JamindarFab } from "@/components/Jamindar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { encodeFilters } from "@/lib/property-search";
import { PROPERTY_TYPE_LABELS, type Property, type PropertyType } from "@/lib/types";

const CARD_W = (Dimensions.get("window").width - space.md * 2 - space.sm) / 2;

const CHIPS: { key: PropertyType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "residential_plot", label: "Plots" },
  { key: "villa_plot", label: "Villa Plots" },
  { key: "farm_land", label: "Farm Land" },
  { key: "commercial_land", label: "Commercial" },
  { key: "apartment", label: "Apartments" },
];

/** Project Explorer — every approved project, organised into intuitive rails
 *  (Featured / Recommended / Ready-to-Move / Ongoing / Upcoming / Recently
 *  Added / Saved) with search + type filters. Reuses the shared listing card
 *  and the existing filtered-list screen for "See all". */
export default function Explorer() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.id;
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["explorer", uid],
    queryFn: async () => {
      const [pool, favs] = await Promise.all([
        supabase.from("properties").select("*").in("status", ["available", "reserved", "sold"]).order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(60),
        uid ? supabase.from("favorites").select("*").eq("user_id", uid).limit(30) : Promise.resolve({ data: [] as any[] }),
      ]);
      const all = (pool.data as Property[]) ?? [];
      const favIds = new Set((favs.data ?? []).map((f: any) => f.property_id ?? f.property).filter(Boolean));
      let saved = all.filter((p) => favIds.has(p.id));
      const missing = [...favIds].filter((id) => !all.some((p) => p.id === id));
      if (missing.length) {
        const { data: extra } = await supabase.from("properties").select("*").in("id", missing as string[]).limit(20);
        saved = [...saved, ...((extra as Property[]) ?? [])];
      }
      return { all, saved };
    },
  });

  function openList(type?: PropertyType) {
    if (!type) return router.push("/(tabs)/properties" as Href);
    router.push({ pathname: "/(tabs)/properties", params: { filters: encodeFilters({ types: [type] }) } } as never);
  }

  const all = data?.all ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? all.filter((p) => `${p.title} ${p.city} ${p.locality} ${p.district} ${p.state} ${p.project_name ?? ""}`.toLowerCase().includes(q))
    : [];

  const byPhase = (ph: string) => all.filter((p) => p.project_phase === ph);
  const rails: { title: string; items: Property[]; type?: PropertyType }[] = [
    { title: "Featured projects", items: all.filter((p) => p.is_featured) },
    { title: "Recommended for you", items: all.filter((p) => !p.is_featured && p.status === "available").slice(0, 12) },
    { title: "Ready to move", items: byPhase("current") },
    { title: "Ongoing projects", items: byPhase("ongoing") },
    { title: "Upcoming projects", items: byPhase("future") },
    { title: "Recently added", items: [...all].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 12) },
    { title: "Saved projects", items: data?.saved ?? [] },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ paddingHorizontal: space.md, paddingTop: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Project Explorer</Text>
        </View>

        {/* search */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, marginTop: space.sm }}>
          <Ionicons name="search" size={18} color={colors.inkFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search projects, cities, localities…"
            placeholderTextColor={colors.inkFaint}
            style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, color: colors.ink }}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* type chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm, maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: space.md, gap: space.xs }}>
        {CHIPS.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => openList(c.key === "all" ? undefined : c.key)}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: T.small.fontSize }}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <Loading label="Loading projects…" />
      ) : all.length === 0 ? (
        <Empty title="No projects yet" subtitle="Approved projects will appear here for you to share." />
      ) : q ? (
        // search results — flat list
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl, gap: space.sm }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, marginBottom: space.xs }}>
            {filtered.length} {filtered.length === 1 ? "result" : "results"} for “{search.trim()}”
          </Text>
          {filtered.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.sm }}>
              {filtered.map((p) => (
                <VerifiedListingCard key={p.id} property={p} width={CARD_W} onPress={() => router.push(`/property/${p.id}` as Href)} />
              ))}
            </View>
          ) : (
            <SoftEmpty icon="search-outline" text="No projects match your search. Try a different city or type." />
          )}
        </ScrollView>
      ) : (
        // rails
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
          {rails.filter((r) => r.items.length).map((r) => (
            <View key={r.title} style={{ paddingHorizontal: space.md }}>
              <PromoterSection title={r.title} actionLabel="See all" onAction={() => openList(r.type)}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}>
                  {r.items.map((p) => (
                    <VerifiedListingCard key={p.id} property={p} width={210} onPress={() => router.push(`/property/${p.id}` as Href)} />
                  ))}
                </ScrollView>
              </PromoterSection>
            </View>
          ))}
          {rails.every((r) => !r.items.length) ? (
            <View style={{ padding: space.md }}>
              <SoftEmpty icon="albums-outline" text="Projects will be organised into rails here as they're published." />
            </View>
          ) : null}
        </ScrollView>
      )}
      <JamindarFab />
    </SafeAreaView>
  );
}
