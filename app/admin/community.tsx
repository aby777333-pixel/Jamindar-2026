import { useState } from "react";
import { Text, View, ScrollView, Pressable, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import { useAdminGate } from "@/components/AdminGate";

type Sub = "posts" | "contacts" | "reports";

/** Phone-side community moderation — mirrors the web Admin Console tab:
 *  posts (hide/restore/remove), the verbatim contact log, and user reports. */
export default function AdminCommunity() {
  const router = useRouter();
  const [sub, setSub] = useState<Sub>("posts");

  const posts = useQuery({
    queryKey: ["admin-comm-posts"],
    enabled: sub === "posts",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*, author:profiles!community_posts_author_id_fkey(full_name,member_code,mobile)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const contacts = useQuery({
    queryKey: ["admin-comm-contacts"],
    enabled: sub === "contacts",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_contact_log")
        .select("*, author:profiles!community_contact_log_author_id_fkey(full_name,member_code)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reports = useQuery({
    queryKey: ["admin-comm-reports"],
    enabled: sub === "reports",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_reports")
        .select("*, reporter:profiles!community_reports_reporter_id_fkey(full_name,member_code), post:community_posts!community_reports_post_id_fkey(body,status)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function setStatus(id: string, status: "published" | "hidden" | "removed") {
    const { error } = await supabase.rpc("admin_set_community_status", { p_id: id, p_status: status });
    if (error) Alert.alert("Couldn't update", error.message);
    posts.refetch();
    reports.refetch();
  }

  async function resolveReport(id: string) {
    const { error } = await supabase.from("community_reports").update({ status: "resolved" }).eq("id", id);
    if (error) { Alert.alert("Couldn't resolve", error.message); return; }
    reports.refetch();
  }

  const chips: { key: Sub; label: string }[] = [
    { key: "posts", label: "Posts" },
    { key: "contacts", label: "Contact log" },
    { key: "reports", label: "Reports" },
  ];

  const stChip = (s: string) => (
    <View style={{ backgroundColor: s === "published" ? colors.successSoft : s === "hidden" ? colors.goldSoft : colors.brandSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 10.5, fontWeight: "700", color: s === "published" ? colors.success : s === "hidden" ? colors.goldDark : colors.brand }}>{s}</Text>
    </View>
  );

  const adminGate = useAdminGate();
  if (adminGate) return adminGate;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Community moderation</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: space.md, marginBottom: space.xs }}>
        {chips.map((c) => (
          <Pressable key={c.key} onPress={() => setSub(c.key)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: sub === c.key ? colors.ink : colors.surface, borderWidth: 1, borderColor: sub === c.key ? colors.ink : colors.border }}>
            <Text style={{ color: sub === c.key ? "#fff" : colors.inkSoft, fontWeight: "700", fontSize: 12.5 }}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 40, gap: space.sm }} showsVerticalScrollIndicator={false}>
        {sub === "posts" ? (
          posts.isLoading ? <Loading /> : (posts.data ?? []).length === 0 ? <Empty title="No posts yet" /> : (
            (posts.data ?? []).map((p: any) => (
              <Card key={p.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 13.5 }}>{p.author?.full_name ?? "Member"}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 11.5 }}>{p.author?.member_code} · {timeAgo(p.created_at)}</Text>
                  {stChip(p.status)}
                  {p.masked ? <Ionicons name="shield-checkmark" size={13} color={colors.success} /> : null}
                </View>
                {p.body ? <Text style={{ color: colors.ink, fontSize: 13.5, lineHeight: 19 }} numberOfLines={5}>{p.body}</Text> : null}
                {(p.media ?? []).length ? (
                  <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
                    📎 {(p.media ?? []).map((m: any) => m.type).join(", ")}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
                  {p.status !== "hidden" ? (
                    <Pressable onPress={() => setStatus(p.id, "hidden")} style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ fontWeight: "700", fontSize: 12, color: colors.inkSoft }}>Hide</Text>
                    </Pressable>
                  ) : null}
                  {p.status !== "published" ? (
                    <Pressable onPress={() => setStatus(p.id, "published")} style={{ backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ fontWeight: "700", fontSize: 12, color: colors.success }}>Restore</Text>
                    </Pressable>
                  ) : null}
                  {p.status !== "removed" ? (
                    <Pressable onPress={() => setStatus(p.id, "removed")} style={{ backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ fontWeight: "700", fontSize: 12, color: colors.brand }}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            ))
          )
        ) : sub === "contacts" ? (
          contacts.isLoading ? <Loading /> : (contacts.data ?? []).length === 0 ? <Empty title="No contacts recorded" subtitle="Emails & numbers typed in community posts appear here verbatim." /> : (
            <>
              <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
                Shown to the public as “[contact hidden]” — recorded here exactly as typed.
              </Text>
              {(contacts.data ?? []).map((r: any) => (
                <Card key={r.id} style={{ gap: 4, paddingVertical: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ backgroundColor: r.kind === "email" ? colors.successSoft : colors.goldSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10.5, fontWeight: "700", color: r.kind === "email" ? colors.success : colors.goldDark }}>{r.kind}</Text>
                    </View>
                    <Pressable onPress={() => Linking.openURL(r.kind === "email" ? `mailto:${r.value}` : `tel:${String(r.value).replace(/[^\d+]/g, "")}`).catch(() => {})}>
                      <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 13.5 }}>{r.value}</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={2}>{r.raw_text}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{r.author?.full_name} {r.author?.member_code} · {timeAgo(r.created_at)}</Text>
                </Card>
              ))}
            </>
          )
        ) : reports.isLoading ? (
          <Loading />
        ) : (reports.data ?? []).length === 0 ? (
          <Empty title="No reports" subtitle="User-flagged posts appear here." />
        ) : (
          (reports.data ?? []).map((r: any) => (
            <Card key={r.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {stChip(r.status === "open" ? "hidden" : "published")}
                <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 13 }}>{r.reason || "report"}</Text>
                <Text style={{ color: colors.inkFaint, fontSize: 11.5 }}>by {r.reporter?.full_name} · {timeAgo(r.created_at)}</Text>
              </View>
              {r.post?.body ? <Text style={{ color: colors.inkSoft, fontSize: 12.5 }} numberOfLines={3}>Post: {r.post.body}</Text> : null}
              <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
                {r.post_id ? (
                  <Pressable onPress={() => setStatus(r.post_id, "hidden")} style={{ backgroundColor: colors.surfaceSunken, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Text style={{ fontWeight: "700", fontSize: 12, color: colors.inkSoft }}>Hide post</Text>
                  </Pressable>
                ) : null}
                {r.status === "open" ? (
                  <Pressable onPress={() => resolveReport(r.id)} style={{ backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Text style={{ fontWeight: "700", fontSize: 12, color: colors.success }}>Mark resolved</Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
