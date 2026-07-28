import { useMemo, useState } from "react";
import { Text, View, FlatList, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Loading, Empty } from "@/components/ui";
import { SiteVisitSheet } from "@/components/SiteVisitSheet";
import { ContactHubSheet } from "@/components/ContactHub";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { colors, type as T } from "@/lib/theme";
import {
  useAllVisits,
  usePromoterVisits,
  useRefreshVisits,
  cancelVisit,
  setVisitStatus,
  formatVisitWhen,
  isVisitOpen,
  VISIT_STATUS_META,
  type SiteVisit,
  type VisitStatus,
} from "@/lib/visits";

const TABS: { key: VisitStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "requested", label: "Requested" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

/** Site-visit desk for promoters (their own) and super admins (everything). */
export default function ManageVisits() {
  const router = useRouter();
  const { profile } = useAuth();
  const role = useEffectiveRole();
  const isAdmin = profile?.role === "super_admin";
  const refresh = useRefreshVisits();

  const adminQ = useAllVisits(isAdmin);
  const promoterQ = usePromoterVisits(isAdmin ? null : profile?.id);
  const { data, isLoading } = isAdmin ? adminQ : promoterQ;

  const [tab, setTab] = useState<VisitStatus | "all">("all");
  const [editing, setEditing] = useState<SiteVisit | null>(null);
  const [contacting, setContacting] = useState<SiteVisit | null>(null);

  const list = useMemo(
    () => (data ?? []).filter((v) => tab === "all" || v.status === tab),
    [data, tab]
  );

  async function advance(v: SiteVisit, status: Exclude<VisitStatus, "cancelled">) {
    try {
      await setVisitStatus(v.id, status);
      refresh();
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message ?? "Please try again.");
    }
  }

  function confirmCancel(v: SiteVisit) {
    Alert.alert("Cancel this visit?", `${v.property?.title ?? "Visit"}\n${formatVisitWhen(v)}`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel visit",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelVisit(v.id, isAdmin ? "Cancelled by Jamin team" : "Cancelled by agent");
            refresh();
          } catch (e: any) {
            Alert.alert("Couldn't cancel", e?.message ?? "Please try again.");
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Site Visits</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
            {isAdmin ? "Every booking across Jamin" : "Visits assigned to you"}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 6 }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          const n = t.key === "all" ? data?.length ?? 0 : (data ?? []).filter((v) => v.status === t.key).length;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                paddingHorizontal: 13,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: on ? colors.brand : colors.surface,
                borderWidth: 1,
                borderColor: on ? colors.brand : colors.border,
              }}
            >
              <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 12.5 }}>
                {t.label}{n > 0 ? ` · ${n}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title="No site visits here" subtitle="Bookings will appear as buyers schedule them." />
      ) : (
        <FlatList
          data={list}
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

                  {v.buyer ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <Ionicons name="person" size={13} color={colors.inkFaint} />
                      <Text style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={1}>
                        {v.buyer.full_name ?? "Buyer"}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                    {[v.property?.locality, v.property?.city].filter(Boolean).join(", ")}
                    {v.visit_ref ? ` · ${v.visit_ref}` : ""}
                    {v.reschedule_count > 0 ? ` · rescheduled ${v.reschedule_count}×` : ""}
                  </Text>
                </Pressable>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
                  {v.buyer?.id ? (
                    <Action icon="chatbubbles" label="Contact" onPress={() => setContacting(v)} />
                  ) : null}
                  {open && v.status === "requested" ? (
                    <Action icon="checkmark-circle" label="Confirm" tint={colors.success} onPress={() => advance(v, "confirmed")} />
                  ) : null}
                  {open && v.status === "confirmed" ? (
                    <Action icon="flag" label="Completed" tint={colors.success} onPress={() => advance(v, "completed")} />
                  ) : null}
                  {open ? <Action icon="calendar-outline" label="Reschedule" onPress={() => setEditing(v)} /> : null}
                  {open ? <Action icon="close-circle-outline" label="Cancel" tint={colors.inkFaint} onPress={() => confirmCancel(v)} /> : null}
                  {/* Bug fix 28-07: a cancellation is no longer irreversible —
                      Reopen puts the visit back into the Requested queue. */}
                  {v.status === "cancelled" ? (
                    <Action icon="refresh-circle" label="Reopen" tint={colors.success} onPress={() => advance(v, "requested")} />
                  ) : null}
                </View>
              </Card>
            );
          }}
        />
      )}

      <SiteVisitSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        propertyId={editing?.property_id ?? ""}
        propertyLabel={editing?.property?.title ?? "Visit"}
        visit={editing}
      />

      <ContactHubSheet
        visible={!!contacting}
        onClose={() => setContacting(null)}
        counterpartId={contacting?.buyer?.id ?? null}
        propertyId={contacting?.property_id ?? null}
        visitId={contacting?.id ?? null}
        context={
          contacting
            ? `Regarding your site visit ${contacting.visit_ref ?? ""} — ${contacting.property?.title ?? ""} on ${formatVisitWhen(contacting)}.`
            : undefined
        }
      />
    </SafeAreaView>
  );
}

function Action({ icon, label, onPress, tint = colors.brand }: { icon: string; label: string; onPress: () => void; tint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Ionicons name={icon as any} size={14} color={tint} />
      <Text style={{ color: tint === colors.inkFaint ? colors.inkSoft : tint, fontWeight: "700", fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
}
