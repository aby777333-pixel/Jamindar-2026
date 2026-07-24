import { useCallback } from "react";
import { Text, View, ScrollView, Pressable, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading } from "@/components/ui";
import { SoftEmpty } from "@/components/promoter";
import { JamindarFab } from "@/components/Jamindar";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR, timeAgo } from "@/lib/format";
import { fetchMySubmissions, SUBMISSION_STATUS, type Submission } from "@/lib/submissions";

const TONE: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceSunken, fg: colors.inkSoft },
  info: { bg: "#E8F1FE", fg: "#2B6FE1" },
  warning: { bg: colors.goldSoft, fg: colors.goldDark },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.brandSoft, fg: colors.brand },
};

/** Lead Capture — the promoter's submitted off-market properties with live
 *  workflow status (submitted → under review → info required → approved /
 *  rejected). Refetches on focus so a fresh submission shows immediately. */
export default function Leads() {
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["my-submissions"], queryFn: fetchMySubmissions });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Lead Capture</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        {/* submit CTA */}
        <Pressable
          onPress={() => router.push("/promoter/submit" as Href)}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: space.sm,
            backgroundColor: colors.navy, borderRadius: space.md, padding: space.md,
            opacity: pressed ? 0.95 : 1,
          })}
        >
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(224,164,35,0.18)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="add-circle" size={24} color={colors.goldLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.body.fontSize }}>Submit a property</Text>
            <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }}>Found an off-market deal? Send it for review.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onDarkFaint} />
        </Pressable>

        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, fontWeight: "700", marginTop: space.lg, marginBottom: space.sm }}>
          Your submissions
        </Text>

        {isLoading ? (
          <Loading label="Loading your submissions…" />
        ) : (data ?? []).length ? (
          (data as Submission[]).map((s) => {
            const meta = SUBMISSION_STATUS[s.status];
            const tone = TONE[meta.tone];
            return (
              <Card key={s.id} style={{ marginBottom: space.sm, flexDirection: "row", gap: space.sm }}>
                <View style={{ width: 58, height: 58, borderRadius: 12, backgroundColor: colors.surfaceSunken, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                  {s.images?.[0] ? (
                    <Image source={{ uri: s.images[0] }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Ionicons name="business" size={22} color={colors.inkFaint} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontWeight: "800", color: colors.ink, fontSize: T.small.fontSize + 1 }}>{s.title ?? "Untitled property"}</Text>
                  <Text numberOfLines={1} style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }}>
                    {[s.locality, s.city, s.state].filter(Boolean).join(", ") || "Location pending"}
                    {s.price ? ` · ${formatINR(s.price)}` : ""}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                      <Ionicons name={meta.icon as any} size={12} color={tone.fg} />
                      <Text style={{ color: tone.fg, fontWeight: "700", fontSize: T.caption.fontSize }}>{meta.label}</Text>
                    </View>
                    <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize }}>{timeAgo(s.created_at)}</Text>
                  </View>
                  {(s.status === "info_required" || s.status === "rejected") && s.review_reason ? (
                    <Text style={{ color: colors.brand, fontSize: T.caption.fontSize + 1, marginTop: 6, lineHeight: T.small.lineHeight }}>
                      {s.review_reason}
                    </Text>
                  ) : null}
                </View>
              </Card>
            );
          })
        ) : (
          <SoftEmpty icon="add-circle-outline" text="No submissions yet. Found a property that isn't on Jamin? Submit it above." />
        )}
      </ScrollView>
      <JamindarFab />
    </SafeAreaView>
  );
}
