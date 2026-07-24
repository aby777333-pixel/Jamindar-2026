import { useState } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, elevation } from "@/components/ui";
import { PromoterSection, SoftEmpty } from "@/components/promoter";
import { JamindarFab } from "@/components/Jamindar";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR } from "@/lib/format";
import { fetchMyTree, fetchMyTreeLevel } from "@/lib/tree";

/** Earning Tree — the promoter's endless multi-level referral network.
 *  Level summary → tap a level → members at that level (attachment 3 → 4).
 *  Sale/Earn are honest ₹0 until the commission engine ships. */
export default function EarningTree() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.id;
  const [level, setLevel] = useState<number | null>(null);

  const { data: levels, isLoading } = useQuery({
    queryKey: ["my-tree", uid],
    enabled: !!uid,
    queryFn: fetchMyTree,
  });

  const { data: members, isLoading: loadingLevel } = useQuery({
    queryKey: ["my-tree-level", uid, level],
    enabled: !!uid && level != null,
    queryFn: () => fetchMyTreeLevel(level as number),
  });

  const total = (levels ?? []).reduce((s, l) => s + l.users, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => (level != null ? setLevel(null) : router.back())} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Earning Tree</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        {/* network hero */}
        <View style={{ backgroundColor: colors.navy, borderRadius: 18, padding: space.md, ...elevation.card }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Ionicons name="git-network" size={16} color={colors.goldLight} />
            <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>
              Your network
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.md, marginTop: space.xs }}>
            <View>
              <Text style={{ color: "#fff", fontSize: T.hero.fontSize, lineHeight: T.hero.lineHeight, fontWeight: "800", letterSpacing: -0.5 }}>{total}</Text>
              <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1 }}>Total members</Text>
            </View>
            <View style={{ paddingBottom: 4 }}>
              <Text style={{ color: colors.goldLight, fontSize: T.subhead.fontSize, fontWeight: "800" }}>{(levels ?? []).length}</Text>
              <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1 }}>Levels deep</Text>
            </View>
          </View>
          {profile?.member_code ? (
            <Text style={{ color: colors.onDarkFaint, fontSize: T.caption.fontSize + 1, marginTop: space.sm }}>
              Promoter ID · <Text style={{ color: "#fff", fontWeight: "700" }}>{profile.member_code}</Text>
            </Text>
          ) : null}
          <Pressable
            onPress={() => router.push("/promoter/card" as Href)}
            style={({ pressed }) => ({ alignSelf: "flex-start", marginTop: space.sm, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: space.sm + 2, paddingVertical: 8, opacity: pressed ? 0.9 : 1 })}
          >
            <Ionicons name="share-social" size={14} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: T.caption.fontSize + 1 }}>Share your link</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={{ paddingTop: space.xl }}>
            <Loading label="Building your tree…" />
          </View>
        ) : level == null ? (
          // ── level summary ──
          <PromoterSection title="Your network by level">
            {(levels ?? []).length ? (
              <View style={{ gap: space.xs }}>
                {(levels ?? []).map((l) => (
                  <Pressable
                    key={l.level}
                    onPress={() => setLevel(l.level)}
                    style={({ pressed }) => ({ transform: [{ translateY: pressed ? 1 : 0 }] })}
                  >
                    <Card style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: colors.brand, fontWeight: "800", fontSize: T.small.fontSize + 1 }}>L{l.level}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.body.fontSize }}>Level {l.level}</Text>
                        <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>{l.users} {l.users === 1 ? "member" : "members"}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>View</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : (
              <SoftEmpty icon="git-network-outline" text="No referrals yet. Share your link to start growing your earning tree." />
            )}
          </PromoterSection>
        ) : (
          // ── level detail ──
          <View style={{ marginTop: space.lg }}>
            <Pressable onPress={() => setLevel(null)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: space.sm }}>
              <Ionicons name="chevron-back" size={16} color={colors.brand} />
              <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>All levels</Text>
            </Pressable>

            <Card style={{ marginBottom: space.sm }}>
              <Text style={{ fontWeight: "800", fontSize: T.subhead.fontSize - 2, color: colors.ink }}>Level {level}</Text>
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 2 }}>
                {(members ?? []).length} members · Total sale {formatINR(0)} · Commission —
              </Text>
            </Card>

            {loadingLevel ? (
              <Loading label={`Loading level ${level}…`} />
            ) : (members ?? []).length ? (
              (members ?? []).map((m) => (
                <Card key={m.user_id} style={{ marginBottom: space.xs, flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="person" size={18} color={colors.inkSoft} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.small.fontSize + 1 }} numberOfLines={1}>
                      {m.member_code ?? "—"}
                    </Text>
                    <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }} numberOfLines={1}>
                      {m.full_name ?? "Member"} · {m.direct_referrals} direct
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: colors.ink, fontWeight: "700", fontSize: T.small.fontSize + 1 }}>{formatINR(m.sale)}</Text>
                    <Text style={{ color: colors.success, fontSize: T.caption.fontSize + 1, fontWeight: "600" }}>+{formatINR(m.earn)}</Text>
                  </View>
                </Card>
              ))
            ) : (
              <SoftEmpty icon="people-outline" text="No members at this level yet." />
            )}

            <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.sm, lineHeight: T.small.lineHeight }}>
              Sale &amp; earnings activate once the commission engine goes live.
            </Text>
          </View>
        )}
      </ScrollView>
      <JamindarFab />
    </SafeAreaView>
  );
}
