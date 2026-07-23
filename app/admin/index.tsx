import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, StatCard, Loading, SectionTitle } from "@/components/ui";
import { JamindarFab } from "@/components/Jamindar";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { timeAgo } from "@/lib/format";

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

export default function AdminConsole() {
  const router = useRouter();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, buyers, promoters, properties, visits, leads, brochures, voice, kycPending] = await Promise.all([
        count("profiles"),
        count("profiles", (q) => q.eq("role", "buyer")),
        count("profiles", (q) => q.eq("role", "promoter")),
        count("properties"),
        count("site_visits"),
        count("leads"),
        count("brochure_downloads"),
        count("voice_logs"),
        count("kyc_submissions", (q) => q.eq("status", "pending")),
      ]);
      return { users, buyers, promoters, properties, visits, leads, brochures, voice, kycPending };
    },
  });

  const { data: recentVoice } = useQuery({
    queryKey: ["admin-voice"],
    queryFn: async () => {
      const { data } = await supabase
        .from("voice_logs")
        .select("id, original_text, ai_response, detected_language, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>Admin Console</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 13 }}>Jamin ecosystem overview</Text>
        </View>
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
            <StatCard label="Total Users" value={stats!.users} />
            <StatCard label="Buyers" value={stats!.buyers} accent={colors.gold} />
            <StatCard label="Promoters" value={stats!.promoters} accent="#4B57C9" />
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
            <StatCard label="Properties" value={stats!.properties} accent="#1E9E6A" />
            <StatCard label="Site Visits" value={stats!.visits} accent="#2B6FE1" />
            <StatCard label="Leads" value={stats!.leads} accent={colors.brand} />
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
            <StatCard label="Brochures" value={stats!.brochures} accent="#159A8C" />
            <StatCard label="Voice Chats" value={stats!.voice} accent="#7C4BC9" />
            <View style={{ flex: 1 }} />
          </View>

          {/* KYC verifications — live entry */}
          <SectionTitle>Verifications</SectionTitle>
          <Card onPress={() => router.push("/admin/kyc" as Href)} style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 24 }}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="shield-checkmark" size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 15 }}>KYC Verifications</Text>
              <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Review, approve or reject submissions</Text>
            </View>
            {stats!.kycPending > 0 ? (
              <View style={{ minWidth: 26, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{stats!.kycPending}</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            )}
          </Card>

          {/* management shortcuts */}
          <SectionTitle>Management</SectionTitle>
          <Card style={{ padding: 0, marginBottom: 24 }}>
            {[
              { icon: "people", label: "User Management", note: "Approve, suspend, assign" },
              { icon: "business", label: "Property Management", note: "Create, edit, media, availability" },
              { icon: "mic", label: "Voice Logs", note: "Speech, language, transcripts" },
              { icon: "bar-chart", label: "Analytics & Reports", note: "Trends, funnels, exports" },
            ].map((r, i) => (
              <View
                key={r.label}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.border }}
              >
                <Ionicons name={r.icon as any} size={22} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: colors.ink }}>{r.label}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12 }}>{r.note}</Text>
                </View>
              </View>
            ))}
          </Card>

          <SectionTitle>Recent Jamindar Conversations</SectionTitle>
          {recentVoice && recentVoice.length > 0 ? (
            recentVoice.map((v: any) => (
              <Card key={v.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{v.detected_language ?? "—"}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{timeAgo(v.created_at)}</Text>
                </View>
                {v.original_text ? (
                  <Text style={{ color: colors.ink, marginTop: 4 }} numberOfLines={2}>
                    🗣 {v.original_text}
                  </Text>
                ) : null}
                <Text style={{ color: colors.inkSoft, marginTop: 4 }} numberOfLines={2}>
                  🙏 {v.ai_response}
                </Text>
              </Card>
            ))
          ) : (
            <Card>
              <Text style={{ color: colors.inkFaint, textAlign: "center" }}>No voice conversations yet.</Text>
            </Card>
          )}
        </ScrollView>
      )}
      <JamindarFab />
    </SafeAreaView>
  );
}
