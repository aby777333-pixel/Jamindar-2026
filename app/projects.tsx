import { useMemo, useState } from "react";
import { Text, View, FlatList, Pressable, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR } from "@/lib/format";
import { encodeFilters } from "@/lib/property-search";
import { PROJECT_PHASES } from "@/components/land";
import type { Property, ProjectPhase } from "@/lib/types";

type ProjectRow = {
  name: string;
  phase: ProjectPhase;
  city: string | null;
  plots: number;
  minPrice: number | null;
  image: string | null;
  /** True when the group came from a real project_name. When false the group is
   *  a single listing whose title stands in for the project, so tapping it must
   *  open that listing rather than filter on a project_name that is null. */
  named: boolean;
  firstId: string | null;
};

const PHASE_META: Record<ProjectPhase, { label: string; bg: string; fg: string }> = {
  ongoing: { label: "Ongoing", bg: colors.goldSoft, fg: colors.goldDark },
  current: { label: "Ready now", bg: colors.brandSoft, fg: colors.brand },
  future: { label: "Upcoming", bg: colors.successSoft, fg: colors.success },
};

/** Every named project on the platform, grouped from the live listings.
 *  This is the destination for Home → Projects → "View all". */
export default function Projects() {
  const router = useRouter();
  const [phase, setPhase] = useState<ProjectPhase | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["all-projects"],
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data } = await supabase
        .from("properties")
        .select("id,title,project_name,project_phase,city,price,images,status")
        .in("status", ["available", "reserved", "sold"]);
      const rows = (data as Partial<Property>[]) ?? [];
      const byName = new Map<string, ProjectRow>();
      for (const p of rows) {
        // Listings may carry no project_name — in this catalogue the title is
        // the project ("Jamin Lake View Villa Plots"), so fall back to it
        // rather than dropping the row and showing an empty page.
        const named = !!(p.project_name ?? "").trim();
        const name = named ? (p.project_name as string).trim() : (p.title ?? "").trim();
        if (!name) continue;
        const cur = byName.get(name);
        const price = typeof p.price === "number" ? p.price : null;
        const img = p.images?.[0] ?? null;
        if (!cur) {
          byName.set(name, {
            name,
            phase: (p.project_phase as ProjectPhase) ?? "current",
            city: p.city ?? null,
            plots: 1,
            minPrice: price,
            image: img,
            named,
            firstId: p.id ?? null,
          });
        } else {
          cur.plots += 1;
          if (price != null && (cur.minPrice == null || price < cur.minPrice)) cur.minPrice = price;
          if (!cur.image && img) cur.image = img;
          if (!cur.city && p.city) cur.city = p.city;
        }
      }
      return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const list = useMemo(
    () => (data ?? []).filter((p) => phase === "all" || p.phase === phase),
    [data, phase]
  );

  function openProject(p: ProjectRow) {
    // Filtering on project_name only works when the group actually has one.
    if (p.named) {
      router.push({ pathname: "/(tabs)/properties", params: { filters: encodeFilters({ projectName: p.name }) } });
    } else if (p.firstId) {
      router.push(`/property/${p.firstId}`);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Projects</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Every Jamin project, by phase</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 4 }}>
        {(["all", ...PROJECT_PHASES.map((p) => p.phase)] as const).map((k) => {
          const on = phase === k;
          return (
            <Pressable
              key={k}
              onPress={() => setPhase(k as ProjectPhase | "all")}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: on ? colors.brand : colors.surface,
                borderWidth: 1,
                borderColor: on ? colors.brand : colors.border,
              }}
            >
              <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 13 }}>
                {k === "all" ? "All" : PHASE_META[k as ProjectPhase].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title="No projects yet" subtitle="Published projects will appear here." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.name}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p }) => {
            const meta = PHASE_META[p.phase] ?? PHASE_META.current;
            return (
              <Pressable onPress={() => openProject(p)}>
                <Card style={{ padding: 0, overflow: "hidden", flexDirection: "row", height: 104 }}>
                  <View style={{ width: 104, height: "100%", backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                    {p.image ? (
                      <Image source={{ uri: p.image }} style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <Ionicons name="business" size={26} color={colors.inkFaint} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, padding: 12, justifyContent: "center" }}>
                    <Text style={{ fontWeight: "700", color: colors.ink }} numberOfLines={1}>{p.name}</Text>
                    {p.city ? (
                      <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{p.city}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 7 }}>
                      <View style={{ backgroundColor: meta.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
                        <Text style={{ color: meta.fg, fontSize: 11, fontWeight: "700" }}>{meta.label}</Text>
                      </View>
                      <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
                        {p.plots} {p.plots === 1 ? "listing" : "listings"}
                      </Text>
                    </View>
                    {p.minPrice != null ? (
                      <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 14, marginTop: 6 }}>
                        from {formatINR(p.minPrice)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ justifyContent: "center", paddingRight: space.xs }}>
                    <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
