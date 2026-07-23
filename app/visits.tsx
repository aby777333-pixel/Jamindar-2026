import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  requested: { label: "Requested", bg: colors.goldSoft, fg: colors.goldDark },
  confirmed: { label: "Confirmed", bg: "#E8F1FE", fg: "#2B6FE1" },
  completed: { label: "Completed", bg: colors.successSoft, fg: colors.success },
  cancelled: { label: "Cancelled", bg: colors.surfaceSunken, fg: colors.inkFaint },
};

export default function Visits() {
  const router = useRouter();
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["visits", profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<any[]> => {
      const { data } = await supabase
        .from("site_visits")
        .select("*, property:properties!site_visits_property_id_fkey(id,title,locality,city)")
        .eq("buyer_id", profile!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Site Visits</Text>
      </View>
      {isLoading ? (
        <Loading />
      ) : data && data.length > 0 ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {data.map((v) => {
            const st = STATUS[v.status] ?? STATUS.requested;
            return (
              <Pressable key={v.id} onPress={() => v.property?.id && router.push(`/property/${v.property.id}`)}>
                <Card style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ flex: 1, fontWeight: "600", color: colors.ink }} numberOfLines={1}>{v.property?.title ?? "Property"}</Text>
                    <View style={{ backgroundColor: st.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                      <Text style={{ color: st.fg, fontSize: 11, fontWeight: "700" }}>{st.label}</Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 4 }}>
                    {[v.property?.locality, v.property?.city].filter(Boolean).join(", ")} · requested {timeAgo(v.created_at)}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Empty title="No site visits yet" subtitle="Schedule a visit from any property to see it here." />
      )}
    </SafeAreaView>
  );
}
