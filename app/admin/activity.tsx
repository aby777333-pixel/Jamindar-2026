import { useEffect, useMemo, useState } from "react";
import { Text, View, FlatList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { liveChannel } from "@/lib/realtime";
import { useAuth } from "@/lib/store";
import { colors, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";

type Row = {
  id: string;
  user_id: string | null;
  event_type: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  actor?: { full_name: string | null; mobile: string | null; role: string } | null;
};

type Group = "all" | "people" | "property" | "visits" | "comms" | "money";

/** How each event_type is presented, and which filter it belongs to. */
const EVENTS: Record<string, { label: string; icon: string; tint: string; group: Group }> = {
  partner_requested:         { label: "Promoter application",   icon: "briefcase",         tint: "#C9A227", group: "people" },
  partner_reviewed:          { label: "Promoter reviewed",      icon: "shield-checkmark",  tint: "#14A05A", group: "people" },
  kyc_submitted:             { label: "KYC submitted",          icon: "id-card",           tint: "#C9A227", group: "people" },
  kyc_reviewed:              { label: "KYC reviewed",           icon: "shield-checkmark",  tint: "#14A05A", group: "people" },
  acquisition_attached:      { label: "New registration",       icon: "person-add",        tint: "#2B6FE1", group: "people" },
  property_viewed:           { label: "Property viewed",        icon: "eye",               tint: "#86868B", group: "property" },
  property_saved:            { label: "Property saved",         icon: "heart",             tint: "#E11B22", group: "property" },
  property_unsaved:          { label: "Property unsaved",       icon: "heart-dislike",     tint: "#86868B", group: "property" },
  property_shared:           { label: "Property shared",        icon: "share-social",      tint: "#4B57C9", group: "property" },
  site_visit_booked:         { label: "Site visit booked",      icon: "calendar",          tint: "#E11B22", group: "visits" },
  site_visit_rescheduled:    { label: "Visit rescheduled",      icon: "calendar-outline",  tint: "#C9A227", group: "visits" },
  site_visit_cancelled:      { label: "Visit cancelled",        icon: "close-circle",      tint: "#86868B", group: "visits" },
  site_visit_status_changed: { label: "Visit status changed",   icon: "flag",              tint: "#14A05A", group: "visits" },
  chat_thread_opened:        { label: "Conversation started",   icon: "chatbubbles",       tint: "#4B57C9", group: "comms" },
  chat_thread_moderated:     { label: "Conversation moderated", icon: "lock-closed",       tint: "#E11B22", group: "comms" },
  chat_message_removed:      { label: "Message removed",        icon: "trash",             tint: "#E11B22", group: "comms" },
  callback_requested:        { label: "Callback requested",     icon: "call",              tint: "#2B6FE1", group: "comms" },
};

function describe(e: Row): { label: string; icon: string; tint: string; group: Group } {
  if (EVENTS[e.event_type]) return EVENTS[e.event_type];
  // communication_<channel> is emitted by log_communication for every channel
  if (e.event_type.startsWith("communication_")) {
    const ch = e.event_type.replace("communication_", "").replace(/_/g, " ");
    return { label: `Contact — ${ch}`, icon: "call", tint: "#2B6FE1", group: "comms" };
  }
  return {
    label: e.event_type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    icon: "ellipse",
    tint: "#86868B",
    group: "all",
  };
}

const TABS: { key: Group; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "people", label: "People" },
  { key: "property", label: "Property" },
  { key: "visits", label: "Visits" },
  { key: "comms", label: "Comms" },
];

/**
 * Live platform activity for the Admin — every significant event as it happens.
 * `activity_log` is append-only and its RLS lets a super admin read all rows,
 * so this is the single place the whole platform surfaces.
 */
export default function AdminActivity() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "super_admin";
  const [tab, setTab] = useState<Group>("all");
  const [live, setLive] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-activity"],
    enabled: isAdmin,
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from("activity_log")
        .select("id,user_id,event_type,meta,created_at,actor:profiles!activity_log_user_id_fkey(full_name,mobile,role)")
        .order("created_at", { ascending: false })
        .limit(300);
      return (data as unknown as Row[]) ?? [];
    },
  });

  // Live tail — migration 0024 put activity_log in the realtime publication.
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel(liveChannel("admin-activity"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-activity"] });
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, qc]);

  const list = useMemo(
    () => (data ?? []).filter((e) => tab === "all" || describe(e).group === tab),
    [data, tab]
  );

  if (!isAdmin) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
        <Empty title="Admins only" subtitle="This console is restricted to Jamin administrators." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>
            Live Activity
          </Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Every event across the platform</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: live ? colors.success : colors.inkFaint }} />
          <Text style={{ color: live ? colors.success : colors.inkFaint, fontSize: 11, fontWeight: "700" }}>
            {live ? "LIVE" : "…"}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 6 }}>
        {TABS.map((t) => {
          const on = tab === t.key;
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
              <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 12.5 }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty title="Nothing here yet" subtitle="Platform events will stream in as they happen." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 9 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: e }) => {
            const d = describe(e);
            const who = e.actor?.full_name ?? (e.actor?.mobile ? `+${e.actor.mobile}` : "System");
            return (
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: colors.surfaceSunken,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={d.icon as any} size={18} color={d.tint} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 14 }} numberOfLines={1}>
                    {d.label}
                  </Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                    {who}
                    {e.actor?.role === "super_admin" ? " · admin" : e.actor?.role === "promoter" ? " · promoter" : ""}
                    {" · "}
                    {timeAgo(e.created_at)}
                  </Text>
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
