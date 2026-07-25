import { useState } from "react";
import { Text, View, FlatList, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Loading, Empty } from "@/components/ui";
import { SiteVisitSheet } from "@/components/SiteVisitSheet";
import { useAuth } from "@/lib/store";
import { colors, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import {
  useMyVisits,
  useRefreshVisits,
  cancelVisit,
  formatVisitWhen,
  isVisitOpen,
  VISIT_STATUS_META,
  type SiteVisit,
} from "@/lib/visits";

/** The buyer's own site visits, with reschedule + cancel. */
export default function Visits() {
  const router = useRouter();
  const { profile } = useAuth();
  const { data, isLoading } = useMyVisits(profile?.id);
  const refresh = useRefreshVisits();
  const [editing, setEditing] = useState<SiteVisit | null>(null);

  function confirmCancel(v: SiteVisit) {
    Alert.alert(
      "Cancel this visit?",
      `${v.property?.title ?? "This visit"}\n${formatVisitWhen(v)}\n\nYour agent and the Jamin team will be notified.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel visit",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelVisit(v.id, "Cancelled by buyer");
              refresh();
            } catch (e: any) {
              Alert.alert("Couldn't cancel", e?.message ?? "Please try again.");
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>My Site Visits</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Booked, confirmed and past visits</Text>
        </View>
      </View>

      {isLoading ? (
        <Loading />
      ) : data && data.length > 0 ? (
        <FlatList
          data={data}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: v }) => {
            const st = VISIT_STATUS_META[v.status] ?? VISIT_STATUS_META.requested;
            const open = isVisitOpen(v);
            return (
              <Card>
                <Pressable onPress={() => v.property?.id && router.push(`/property/${v.property.id}`)}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ flex: 1, fontWeight: "700", color: colors.ink }} numberOfLines={1}>
                      {v.property?.title ?? "Property"}
                    </Text>
                    <View style={{ backgroundColor: st.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                      <Text style={{ color: st.fg, fontSize: 11, fontWeight: "700" }}>{st.label}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <Ionicons name="calendar" size={14} color={colors.brand} />
                    <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>{formatVisitWhen(v)}</Text>
                  </View>

                  <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                    {[v.property?.locality, v.property?.city].filter(Boolean).join(", ")}
                    {v.visit_ref ? ` · ${v.visit_ref}` : ""} · booked {timeAgo(v.created_at)}
                  </Text>

                  {v.status === "cancelled" && v.cancel_reason ? (
                    <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 4 }}>{v.cancel_reason}</Text>
                  ) : null}
                </Pressable>

                {open ? (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
                    <Pressable
                      onPress={() => setEditing(v)}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
                    >
                      <Ionicons name="calendar-outline" size={15} color={colors.brand} />
                      <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>Reschedule</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmCancel(v)}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
                    >
                      <Ionicons name="close-circle-outline" size={15} color={colors.inkFaint} />
                      <Text style={{ color: colors.inkSoft, fontWeight: "700", fontSize: 13 }}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      ) : (
        <Empty title="No site visits yet" subtitle="Schedule a visit from any property to see it here." />
      )}

      <SiteVisitSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        propertyId={editing?.property_id ?? ""}
        propertyLabel={editing?.property?.title ?? "Your visit"}
        visit={editing}
      />
    </SafeAreaView>
  );
}
