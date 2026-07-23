import { useEffect } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import type { AppNotification } from "@/lib/types";

const ICON: Record<string, string> = { kyc: "shield-checkmark", info: "notifications", lead: "call", visit: "calendar" };

export default function Notifications() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const { data: items, isLoading } = useQuery({
    queryKey: ["notifications", profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data as AppNotification[]) ?? [];
    },
  });

  // mark unread as read once the list is seen
  useEffect(() => {
    if (!profile?.id || !items) return;
    const unread = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unread.length === 0) return;
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread)
      .then(() => qc.invalidateQueries({ queryKey: ["notifications", profile.id] }));
  }, [items, profile?.id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Notifications</Text>
      </View>

      {isLoading ? (
        <Loading />
      ) : items && items.length > 0 ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {items.map((n) => (
            <Card key={n.id} style={{ marginBottom: 10, flexDirection: "row", gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={(ICON[n.type] ?? "notifications") as any} size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ flex: 1, fontWeight: "600", color: colors.ink, fontSize: T.small.fontSize + 1 }}>{n.title}</Text>
                  {!n.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand }} /> : null}
                </View>
                {n.body ? <Text style={{ color: colors.inkSoft, fontSize: T.small.fontSize, lineHeight: 19, marginTop: 3 }}>{n.body}</Text> : null}
                <Text style={{ color: colors.inkFaint, fontSize: 11, marginTop: 5 }}>{timeAgo(n.created_at)}</Text>
              </View>
            </Card>
          ))}
        </ScrollView>
      ) : (
        <Empty title="No notifications yet" subtitle="Updates on your KYC, enquiries and visits will appear here." />
      )}
    </SafeAreaView>
  );
}
