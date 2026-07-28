import { useMemo, useState } from "react";
import { Text, View, FlatList, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";

// Mirrors the lead_status enum (0001): new/contacted/qualified/converted/lost.
const STATUSES = ["all", "new", "contacted", "qualified", "converted", "lost"] as const;

const TONE: Record<string, { bg: string; fg: string }> = {
  new: { bg: colors.goldSoft, fg: colors.goldDark },
  contacted: { bg: "#E8F1FE", fg: "#2B6FE1" },
  qualified: { bg: "#F2EBFB", fg: "#7C4BC9" },
  converted: { bg: colors.successSoft, fg: colors.success },
  lost: { bg: colors.surfaceSunken, fg: colors.inkSoft },
};

/** The records behind the "Your performance" cards (bug 28-07) — the
 *  promoter's own leads, filterable by status. RLS scopes rows server-side. */
export default function PromoterLeadsList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ status?: string }>();
  const [status, setStatus] = useState<string>(
    STATUSES.includes((params.status ?? "all") as (typeof STATUSES)[number]) ? params.status ?? "all" : "all"
  );

  const { data, isLoading } = useQuery({
    queryKey: ["promoter-leads-list", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*, buyer:profiles!leads_buyer_id_fkey(full_name,member_code), property:properties!leads_property_id_fkey(title)")
        .eq("promoter_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const list = useMemo(
    () => (data ?? []).filter((l: any) => status === "all" || l.status === status),
    [data, status]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>My Leads & Enquiries</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>{list.length} {list.length === 1 ? "record" : "records"}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: space.md, paddingBottom: 6 }}>
        {STATUSES.map((s) => {
          const on = status === s;
          return (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.brand : colors.surface, borderWidth: 1, borderColor: on ? colors.brand : colors.border }}
            >
              <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "700", fontSize: 12.5, textTransform: "capitalize" }}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title="No leads here" subtitle="Enquiries from buyers you're assigned to will appear here." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(l: any) => l.id}
          contentContainerStyle={{ padding: space.md, paddingBottom: 30 + insets.bottom, gap: 10 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: l }: { item: any }) => {
            const tone = TONE[l.status] ?? TONE.closed;
            return (
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ flex: 1, fontWeight: "800", color: colors.ink, fontSize: 14 }} numberOfLines={1}>
                    {l.buyer?.full_name ?? "Buyer"}
                  </Text>
                  <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: tone.fg, fontSize: 11, fontWeight: "700", textTransform: "capitalize" }}>{l.status}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.inkFaint, fontSize: 12.5 }} numberOfLines={1}>
                  {[l.buyer?.member_code, l.property?.title, l.source].filter(Boolean).join(" · ")}
                </Text>
                {l.notes ? (
                  <Text style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>{l.notes}</Text>
                ) : null}
                <Text style={{ color: colors.inkFaint, fontSize: 11.5 }}>{timeAgo(l.created_at)}</Text>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
