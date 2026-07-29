import { useMemo, useState } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading } from "@/components/ui";
import { KpiTile, PromoterSection, SoftEmpty } from "@/components/promoter";
import { JamindarFab } from "@/components/Jamindar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR, timeAgo } from "@/lib/format";

/** Jamin Bazaar — Sales Income (migration 0056). DSI / RSI / ASI / Wallet
 *  views over the commission engine + bazaar ledger, with the rank ladder,
 *  launch-offer progress and date-filtered history. All money is
 *  server-computed; this screen only reads and formats. */

type Segment = "dsi" | "rsi" | "asi" | "wallet";
type Range = "all" | "month" | "last" | "quarter";

type Bucket = { total: number; available: number; paid: number; locked?: number };
type Summary = {
  dsi: Bucket; rsi: Bucket; asi: Bucket; other: Bucket;
  withdrawn: number; rsi_locked: boolean;
  status: {
    direct_sales_count: number; direct_referrals_count: number; team_sales: number;
    min_referral_team_sales: number; current_level: number; designation: string | null;
    rsi_unlocked: boolean;
  } | null;
  next_level: { level: number; designation: string; per_referral_team_sales: number; min_direct_referrals: number } | null;
  referral_progress: { id: string; name: string; team_sales: number }[];
  awards: { id: string; level: number; designation: string; monthly_amount: number; months_credited: number; months_total: number; valid_until: string; status: string }[];
  offers: { id: string; title: string; description: string | null; required_direct_sales: number; reward_type: string; reward_label: string | null; reward_amount: number; ends_at: string; my_sales: number; achieved: boolean }[];
};

type HistoryRow = { entry_date: string; income_type: string; description: string; reference_no: string; amount: number; status: string };

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "dsi", label: "Direct Sales" },
  { key: "rsi", label: "Referral" },
  { key: "asi", label: "Awards" },
  { key: "wallet", label: "Wallet" },
];

const RANGES: { key: Range; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "quarter", label: "3 months" },
];

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: colors.goldSoft, fg: colors.goldDark },
  approved: { bg: "#E8F1FE", fg: "#2B6FE1" },
  paid: { bg: colors.successSoft, fg: colors.success },
  rejected: { bg: colors.surfaceSunken, fg: colors.inkSoft },
  cancelled: { bg: colors.surfaceSunken, fg: colors.inkSoft },
};

function rangeDates(r: Range): { from?: string; to?: string } {
  if (r === "all") return {};
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (r === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
  if (r === "last")
    return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  return { from: iso(new Date(now.getFullYear(), now.getMonth() - 3, 1)) };
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexGrow: 1, alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : colors.border }}>
      <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: on ? "700" : "600", fontSize: T.small.fontSize }}>{label}</Text>
    </Pressable>
  );
}

export default function SalesIncome() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.id;
  const [seg, setSeg] = useState<Segment>("dsi");
  const [range, setRange] = useState<Range>("all");

  const { data: s, isLoading } = useQuery({
    queryKey: ["bazaar-summary", uid],
    enabled: !!uid,
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase.rpc("bazaar_income_summary");
      if (error) throw error;
      return data as unknown as Summary;
    },
  });

  const dates = useMemo(() => rangeDates(range), [range]);
  const { data: history } = useQuery({
    queryKey: ["bazaar-history", uid, seg, range],
    enabled: !!uid,
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase.rpc("bazaar_income_history", {
        p_type: seg === "wallet" ? undefined : seg,
        p_from: dates.from,
        p_to: dates.to,
      });
      if (error) throw error;
      return (data as HistoryRow[]) ?? [];
    },
  });

  const bucket: Bucket | null = !s ? null : seg === "dsi" ? s.dsi : seg === "rsi" ? s.rsi : seg === "asi" ? s.asi : null;
  const st = s?.status;
  const next = s?.next_level;
  const teamNow = Number(st?.min_referral_team_sales ?? 0);
  const teamNeed = Number(next?.per_referral_team_sales ?? 0);
  const pct = teamNeed > 0 ? Math.max(0, Math.min(100, (teamNow / teamNeed) * 100)) : 0;
  const walletTotal = s ? Number(s.dsi.total) + Number(s.rsi.total) + Number(s.asi.total) + Number(s.other.total) : 0;
  const walletAvailable = s
    ? Number(s.dsi.available) + Number(s.rsi.available) + Number(s.asi.available) + Number(s.other.available)
    : 0;
  const lockedTotal = s ? Number(s.rsi.locked ?? 0) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Sales Income</Text>
      </View>

      {isLoading || !s ? (
        <Loading label="Loading your income…" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
          {/* rank / designation */}
          <Card style={{ marginBottom: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, fontWeight: "700", letterSpacing: 0.5 }}>MY DESIGNATION</Text>
              {st && st.current_level > 0 ? (
                <View style={{ backgroundColor: colors.goldSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: colors.goldDark, fontWeight: "800", fontSize: T.caption.fontSize + 1 }}>LEVEL {st.current_level}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: colors.ink, fontWeight: "800", fontSize: T.subhead.fontSize, marginTop: 4 }}>
              {st?.designation ?? "Jamin Partner — keep building your team!"}
            </Text>
            {next ? (
              <View style={{ marginTop: space.sm }}>
                <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>
                  Next: {next.designation} (Level {next.level}) · {st?.direct_referrals_count ?? 0}/{next.min_direct_referrals} direct referrals · weakest team {formatINR(teamNow)} / {formatINR(teamNeed)}
                </Text>
                <View style={{ height: 7, borderRadius: 999, backgroundColor: colors.surfaceSunken, marginTop: 7, overflow: "hidden" }}>
                  <View style={{ width: `${pct}%`, height: 7, borderRadius: 999, backgroundColor: pct >= 100 ? colors.success : colors.brand }} />
                </View>
              </View>
            ) : null}
            {s.referral_progress.length ? (
              <View style={{ marginTop: space.sm, gap: 5 }}>
                {s.referral_progress.slice(0, 6).map((r) => (
                  <View key={r.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.inkSoft, fontSize: T.small.fontSize }} numberOfLines={1}>{r.name}</Text>
                    <Text style={{ color: colors.ink, fontWeight: "700", fontSize: T.small.fontSize }}>{formatINR(r.team_sales)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          {/* segment chips */}
          <View style={{ flexDirection: "row", gap: space.xs, marginBottom: space.sm }}>
            {SEGMENTS.map((x) => (
              <Chip key={x.key} label={x.label} on={seg === x.key} onPress={() => setSeg(x.key)} />
            ))}
          </View>

          {/* totals */}
          {seg === "wallet" ? (
            <View style={{ gap: space.sm, marginBottom: space.sm }}>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <KpiTile icon="wallet" label="Available" value={formatINR(walletAvailable)} tint={colors.successSoft} accent={colors.success} />
                <KpiTile icon="trending-up" label="Total earned" value={formatINR(walletTotal)} tint={colors.brandSoft} accent={colors.brand} />
              </View>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <KpiTile icon="lock-closed" label="Locked" value={formatINR(lockedTotal)} tint={colors.goldSoft} accent={colors.goldDark} />
                <KpiTile icon="checkmark-done" label="Withdrawn" value={formatINR(s.withdrawn)} tint={colors.surfaceSunken} accent={colors.inkSoft} />
              </View>
            </View>
          ) : (
            <View style={{ gap: space.sm, marginBottom: space.sm }}>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <KpiTile icon="trending-up" label="Total earned" value={formatINR(bucket?.total ?? 0)} tint={colors.brandSoft} accent={colors.brand} />
                <KpiTile icon="hourglass" label="Available" value={formatINR(bucket?.available ?? 0)} tint={colors.goldSoft} accent={colors.goldDark} />
                <KpiTile icon="checkmark-done" label="Paid out" value={formatINR(bucket?.paid ?? 0)} tint={colors.successSoft} accent={colors.success} />
              </View>
              {seg === "rsi" && s.rsi_locked && Number(s.rsi.locked ?? 0) > 0 ? (
                <Card style={{ backgroundColor: colors.goldSoft, borderColor: colors.goldSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Ionicons name="lock-closed" size={18} color={colors.goldDark} />
                    <Text style={{ flex: 1, color: colors.goldDark, fontSize: T.small.fontSize, fontWeight: "600" }}>
                      {formatINR(s.rsi.locked ?? 0)} locked · complete your first direct sale to unlock your referral income.
                    </Text>
                  </View>
                </Card>
              ) : null}
            </View>
          )}

          {/* date filters */}
          <View style={{ flexDirection: "row", gap: space.xs, marginBottom: space.xs }}>
            {RANGES.map((r) => (
              <Chip key={r.key} label={r.label} on={range === r.key} onPress={() => setRange(r.key)} />
            ))}
          </View>

          {/* history */}
          <PromoterSection title="Transaction history">
            {history && history.length ? (
              history.map((h) => {
                const tone = STATUS_TONE[h.status] ?? STATUS_TONE.pending;
                const locked = seg === "rsi" && s.rsi_locked && (h.status === "pending" || h.status === "approved");
                return (
                  <Card key={`${h.reference_no}-${h.entry_date}`} style={{ marginBottom: space.xs, flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.brand, fontWeight: "800", fontSize: T.caption.fontSize + 1 }}>{h.income_type.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: colors.ink, fontSize: T.small.fontSize + 1 }} numberOfLines={2}>{h.description}</Text>
                      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>{h.reference_no} · {timeAgo(h.entry_date)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <Text style={{ color: colors.ink, fontWeight: "800", fontSize: T.body.fontSize }}>{formatINR(h.amount)}</Text>
                      <View style={{ backgroundColor: locked ? colors.goldSoft : tone.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: locked ? colors.goldDark : tone.fg, fontSize: T.caption.fontSize, fontWeight: "700" }}>
                          {locked ? "Locked" : h.status}
                        </Text>
                      </View>
                    </View>
                  </Card>
                );
              })
            ) : (
              <SoftEmpty icon="cash-outline" text="No transactions yet. Income from your sales, referrals and awards appears here." />
            )}
          </PromoterSection>

          {/* awards received */}
          {seg === "asi" && s.awards.length ? (
            <PromoterSection title="Awards received">
              {s.awards.map((a) => (
                <Card key={a.id} style={{ marginBottom: space.xs }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontWeight: "800", color: colors.ink, fontSize: T.small.fontSize + 1 }}>{a.designation} · L{a.level}</Text>
                    <View style={{ backgroundColor: a.status === "active" ? colors.successSoft : colors.surfaceSunken, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: a.status === "active" ? colors.success : colors.inkSoft, fontSize: T.caption.fontSize, fontWeight: "700" }}>{a.status}</Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 4 }}>
                    {formatINR(a.monthly_amount)}/month · {a.months_credited}/{a.months_total} months credited · valid till {new Date(a.valid_until).toLocaleDateString("en-IN")}
                  </Text>
                </Card>
              ))}
            </PromoterSection>
          ) : null}

          {/* launch offers */}
          {s.offers.length ? (
            <PromoterSection title="Launch offers">
              {s.offers.map((o) => {
                const opct = Math.max(0, Math.min(100, (o.my_sales / Math.max(1, o.required_direct_sales)) * 100));
                return (
                  <Card key={o.id} style={{ marginBottom: space.xs }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ flex: 1, fontWeight: "800", color: colors.ink, fontSize: T.small.fontSize + 1 }} numberOfLines={1}>{o.title}</Text>
                      {o.achieved ? (
                        <View style={{ backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color: colors.success, fontSize: T.caption.fontSize, fontWeight: "800" }}>ACHIEVED</Text>
                        </View>
                      ) : null}
                    </View>
                    {o.description ? (
                      <Text style={{ color: colors.inkSoft, fontSize: T.small.fontSize, marginTop: 3 }} numberOfLines={3}>{o.description}</Text>
                    ) : null}
                    <View style={{ height: 7, borderRadius: 999, backgroundColor: colors.surfaceSunken, marginTop: 8, overflow: "hidden" }}>
                      <View style={{ width: `${opct}%`, height: 7, borderRadius: 999, backgroundColor: opct >= 100 ? colors.success : colors.brand }} />
                    </View>
                    <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 5 }}>
                      {o.my_sales}/{o.required_direct_sales} direct sales · reward: {o.reward_label ?? o.reward_type.replace(/_/g, " ")}
                      {o.reward_amount > 0 ? ` (${formatINR(o.reward_amount)})` : ""} · ends {new Date(o.ends_at).toLocaleDateString("en-IN")}
                    </Text>
                  </Card>
                );
              })}
            </PromoterSection>
          ) : null}
        </ScrollView>
      )}
      <JamindarFab />
    </SafeAreaView>
  );
}
