import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, elevation } from "@/components/ui";
import { KpiTile, PromoterSection, SoftEmpty, EarningsCard } from "@/components/promoter";
import { JamindarFab } from "@/components/Jamindar";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR, timeAgo } from "@/lib/format";
import { fetchMyEarnings, fetchMyCommissions, type CommissionRow } from "@/lib/earnings";

const STATUS: Record<CommissionRow["status"], { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending", bg: colors.goldSoft, fg: colors.goldDark },
  approved: { label: "Approved", bg: "#E8F1FE", fg: "#2B6FE1" },
  paid: { label: "Paid", bg: colors.successSoft, fg: colors.success },
  cancelled: { label: "Cancelled", bg: colors.surfaceSunken, fg: colors.inkSoft },
};

/** Earnings & Commission — real ledger totals + commission history. Numbers are
 *  all server-computed (migration 0017); the screen only reads and formats. */
export default function Earnings() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.id;

  const { data: earn, isLoading } = useQuery({ queryKey: ["my-earnings", uid], enabled: !!uid, queryFn: fetchMyEarnings });
  const { data: rows } = useQuery({ queryKey: ["my-commissions", uid], enabled: !!uid, queryFn: () => fetchMyCommissions(60) });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Earnings</Text>
        <Pressable onPress={() => router.push("/promoter/tree" as Href)} hitSlop={8}>
          <Ionicons name="git-network" size={22} color={colors.goldDark} />
        </Pressable>
      </View>

      {isLoading || !earn ? (
        <Loading label="Loading your earnings…" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
          <EarningsCard
            total={formatINR(earn.total)}
            pending={formatINR(earn.pending)}
            paid={formatINR(earn.paid)}
            caption={earn.count ? `${earn.count} commission ${earn.count === 1 ? "entry" : "entries"} across your network.` : "No commissions yet — earnings appear as your network makes sales."}
          />

          <PromoterSection title="At a glance">
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <KpiTile icon="hourglass" label="Pending" value={formatINR(earn.pending)} tint={colors.goldSoft} accent={colors.goldDark} />
              <KpiTile icon="checkmark-done" label="Paid out" value={formatINR(earn.paid)} tint={colors.successSoft} accent={colors.success} />
              <KpiTile icon="receipt" label="Entries" value={earn.count} tint={colors.brandSoft} accent={colors.brand} />
            </View>
          </PromoterSection>

          <PromoterSection title="Commission history">
            {rows && rows.length ? (
              rows.map((c) => {
                const s = STATUS[c.status];
                return (
                  <Card key={c.id} style={{ marginBottom: space.xs, flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.brand, fontWeight: "800", fontSize: T.small.fontSize }}>L{c.level}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.small.fontSize + 1 }} numberOfLines={1}>
                        {c.from_member ?? c.from_name ?? "Network sale"}
                      </Text>
                      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>{timeAgo(c.created_at)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <Text style={{ color: colors.ink, fontWeight: "800", fontSize: T.body.fontSize }}>{formatINR(c.amount)}</Text>
                      <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: s.fg, fontSize: T.caption.fontSize, fontWeight: "700" }}>{s.label}</Text>
                      </View>
                    </View>
                  </Card>
                );
              })
            ) : (
              <SoftEmpty icon="cash-outline" text="No commissions yet. When your downline closes a sale, your share appears here automatically." />
            )}
          </PromoterSection>

          {/* future: statements / incentives — reserved */}
          <View style={{ marginTop: space.lg, flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: space.md, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surface, padding: space.sm + 2, ...elevation.low }}>
            <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document-text" size={21} color={colors.goldDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: T.small.fontSize + 1, color: colors.ink }}>Downloadable statements</Text>
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }}>Monthly PDF statements &amp; incentive programs.</Text>
            </View>
            <View style={{ backgroundColor: colors.goldSoft, borderRadius: 999, paddingHorizontal: space.xs + 2, paddingVertical: 4 }}>
              <Text style={{ color: colors.goldDark, fontSize: T.caption.fontSize, fontWeight: "800" }}>Coming soon</Text>
            </View>
          </View>
        </ScrollView>
      )}
      <JamindarFab />
    </SafeAreaView>
  );
}
