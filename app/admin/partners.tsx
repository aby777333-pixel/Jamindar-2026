import { useState } from "react";
import { Text, View, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Loading, Empty, Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";

const FILTERS = ["pending", "verified", "rejected"] as const;

export default function AdminPartners() {
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-partners", filter],
    queryFn: async (): Promise<any[]> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, member_code, mobile, partner_status, partner_code, partner_verified_at")
        .eq("partner_status", filter)
        .order("member_code", { ascending: true })
        .limit(100);
      return data ?? [];
    },
  });

  async function review(userId: string, decision: "verified" | "rejected") {
    setBusy(userId + decision);
    try {
      const { error } = await supabase.rpc("admin_review_partner", { p_user: userId, p_decision: decision, p_reason: null });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["admin-partners"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message ?? "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Partner Requests</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 6 }}>
        {FILTERS.map((s) => {
          const on = filter === s;
          return (
            <Pressable key={s} onPress={() => setFilter(s)} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : colors.border }}>
              <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: on ? "600" : "500", fontSize: 13, textTransform: "capitalize" }}>{s}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <Loading />
      ) : data && data.length > 0 ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {data.map((p) => (
            <Card key={p.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="ribbon" size={20} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: colors.ink }} numberOfLines={1}>{p.full_name ?? "Applicant"}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>
                    {[p.member_code, p.partner_code, p.mobile ? `+${p.mobile}` : null].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
              {filter === "pending" ? (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Reject" variant="outline" onPress={() => review(p.id, "rejected")} loading={busy === p.id + "rejected"} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Verify" variant="gold" onPress={() => review(p.id, "verified")} loading={busy === p.id + "verified"} />
                  </View>
                </View>
              ) : null}
            </Card>
          ))}
        </ScrollView>
      ) : (
        <Empty title={`No ${filter} partners`} subtitle="Buyer partner requests will appear here for review." />
      )}
    </SafeAreaView>
  );
}
