import { useMemo, useState } from "react";
import { Text, View, ScrollView, Pressable, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Loading } from "@/components/ui";
import { KpiTile, PromoterSection, SoftEmpty } from "@/components/promoter";
import { JamindarFab } from "@/components/Jamindar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR, timeAgo } from "@/lib/format";
import { usePromoterGate } from "@/components/PromoterGate";

/** Jamin Bazaar — Sales Income (migration 0056). DSI / RSI / ASI / Wallet
 *  views over the commission engine + bazaar ledger, with the rank ladder,
 *  launch-offer progress and date-filtered history. All money is
 *  server-computed; this screen only reads and formats. */

type Segment = "dsi" | "rsi" | "asi" | "wallet";
type Range = "all" | "today" | "yesterday" | "week" | "lastweek" | "month" | "lastmonth" | "year" | "lastyear" | "custom";
type StatusFilter = "all" | "pending" | "approved" | "paid";

type Bucket = { total: number; available: number; paid: number; locked?: number };
type Summary = {
  dsi: Bucket; rsi: Bucket; asi: Bucket; other: Bucket;
  withdrawn: number; tx_count?: number; rsi_locked: boolean;
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

type WalletRequest = { id: string; amount: number; method: string; status: string; remarks: string | null; created_at: string; paid_at: string | null };
type Wallet = {
  balance: number; withdrawable: number; pending_income: number; total_earnings: number;
  on_hold: number; withdrawn: number; min_withdrawal: number;
  last_details: Record<string, string> | null; requests: WalletRequest[];
};

const WD_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: colors.goldSoft, fg: colors.goldDark, label: "Pending" },
  approved: { bg: "#E8F1FE", fg: "#2B6FE1", label: "Approved" },
  paid: { bg: colors.successSoft, fg: colors.success, label: "Paid" },
  declined: { bg: colors.brandSoft, fg: colors.brand, label: "Declined" },
};

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "dsi", label: "Direct Sales" },
  { key: "rsi", label: "Referral" },
  { key: "asi", label: "Awards" },
  { key: "wallet", label: "Wallet" },
];

const RANGES: { key: Range; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "lastweek", label: "Last week" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "lastyear", label: "Last year" },
  { key: "custom", label: "Custom…" },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All statuses" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

/** Filters survive screen exits within the session (owner spec: "remember the
 *  last selected filter during the current session"). Module-level on purpose. */
const sessionFilter: { range: Range; status: StatusFilter; search: string; from: string; to: string } = {
  range: "all", status: "all", search: "", from: "", to: "",
};

/** dd/mm/yyyy → yyyy-mm-dd (ISO) or null when not a real calendar date. */
function parseDMY(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  if (d.getUTCFullYear() !== Number(m[3]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[1])) return null;
  return d.toISOString().slice(0, 10);
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: colors.goldSoft, fg: colors.goldDark },
  approved: { bg: "#E8F1FE", fg: "#2B6FE1" },
  paid: { bg: colors.successSoft, fg: colors.success },
  rejected: { bg: colors.surfaceSunken, fg: colors.inkSoft },
  cancelled: { bg: colors.surfaceSunken, fg: colors.inkSoft },
};

function rangeDates(r: Range, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  // Monday-start weeks, matching Indian business convention.
  const monday = (base: Date) => { const d = new Date(base); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  switch (r) {
    case "all": return {};
    case "today": return { from: iso(day(0)), to: iso(day(0)) };
    case "yesterday": return { from: iso(day(-1)), to: iso(day(-1)) };
    case "week": return { from: iso(monday(now)), to: iso(day(0)) };
    case "lastweek": {
      const m = monday(now); const from = new Date(m); from.setDate(from.getDate() - 7);
      const to = new Date(m); to.setDate(to.getDate() - 1);
      return { from: iso(from), to: iso(to) };
    }
    case "month": return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
    case "lastmonth":
      return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "year": return { from: `${now.getFullYear()}-01-01` };
    case "lastyear": return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` };
    case "custom": {
      const from = parseDMY(customFrom) ?? undefined;
      const to = parseDMY(customTo) ?? undefined;
      return { from, to };
    }
  }
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
  const qc = useQueryClient();
  const uid = profile?.id;
  const [seg, setSeg] = useState<Segment>("dsi");
  const [wdOpen, setWdOpen] = useState(false);
  const [wdAmount, setWdAmount] = useState("");
  const [wdMethod, setWdMethod] = useState<"bank" | "upi">("bank");
  const [wdFields, setWdFields] = useState<Record<string, string>>({});
  const [wdBusy, setWdBusy] = useState(false);
  const [range, setRangeState] = useState<Range>(sessionFilter.range);
  const [statusF, setStatusFState] = useState<StatusFilter>(sessionFilter.status);
  const [search, setSearchState] = useState(sessionFilter.search);
  const [customFrom, setCustomFrom] = useState(sessionFilter.from);
  const [customTo, setCustomTo] = useState(sessionFilter.to);
  const setRange = (r: Range) => { sessionFilter.range = r; setRangeState(r); };
  const setStatusF = (x: StatusFilter) => { sessionFilter.status = x; setStatusFState(x); };
  const setSearch = (x: string) => { sessionFilter.search = x; setSearchState(x); };

  const dates = useMemo(() => rangeDates(range, customFrom, customTo), [range, customFrom, customTo]);
  const filterActive = range !== "all" || statusF !== "all" || !!search.trim();
  const activeLabel = [
    range !== "all"
      ? range === "custom"
        ? `${customFrom || "…"} → ${customTo || "…"}`
        : RANGES.find((r) => r.key === range)?.label
      : null,
    statusF !== "all" ? STATUS_FILTERS.find((x) => x.key === statusF)?.label : null,
    search.trim() ? `“${search.trim()}”` : null,
  ].filter(Boolean).join(" · ");

  function clearFilters() {
    setRange("all"); setStatusF("all"); setSearch("");
    setCustomFrom(""); setCustomTo("");
    sessionFilter.from = ""; sessionFilter.to = "";
  }

  // Summary totals recalculate for the selected period (owner spec 29-07).
  const { data: s, isLoading } = useQuery({
    queryKey: ["bazaar-summary", uid, dates.from ?? "", dates.to ?? ""],
    enabled: !!uid,
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase.rpc("bazaar_income_summary", {
        p_from: dates.from, p_to: dates.to,
      });
      if (error) throw error;
      return data as unknown as Summary;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["bazaar-history", uid, seg, statusF, search, dates.from ?? "", dates.to ?? ""],
    enabled: !!uid,
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase.rpc("bazaar_income_history", {
        p_type: seg === "wallet" ? undefined : seg,
        p_from: dates.from,
        p_to: dates.to,
        p_status: statusF === "all" ? undefined : statusF,
        p_search: search.trim() || undefined,
      });
      if (error) throw error;
      return (data as HistoryRow[]) ?? [];
    },
  });

  // Live wallet (0059): server-computed balance, holds and request history.
  const { data: w } = useQuery({
    queryKey: ["bazaar-wallet", uid],
    enabled: !!uid && seg === "wallet",
    queryFn: async (): Promise<Wallet> => {
      const { data, error } = await supabase.rpc("bazaar_wallet_summary");
      if (error) throw error;
      return data as unknown as Wallet;
    },
  });

  async function submitWithdrawal() {
    const amt = Number(wdAmount.replace(/[^0-9.]/g, ""));
    if (!amt || amt <= 0) { Alert.alert("Withdrawal", "Enter a valid amount."); return; }
    setWdBusy(true);
    try {
      const details = wdMethod === "bank"
        ? { holder: wdFields.holder ?? "", bank: wdFields.bank ?? "", account: wdFields.account ?? "", ifsc: wdFields.ifsc ?? "" }
        : { upi: wdFields.upi ?? "" };
      const { data, error } = await supabase.rpc("bazaar_request_withdrawal", {
        p_amount: amt, p_method: wdMethod, p_details: details,
      });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (!r.ok) { Alert.alert("Withdrawal", r.error ?? "Could not submit the request."); return; }
      setWdOpen(false); setWdAmount("");
      qc.invalidateQueries({ queryKey: ["bazaar-wallet", uid] });
      Alert.alert("Request submitted 🎉", "Your withdrawal request has been sent for approval. You'll be notified as soon as it is reviewed.");
    } catch (e: any) {
      Alert.alert("Withdrawal", e?.message ?? "Something went wrong — please try again.");
    } finally {
      setWdBusy(false);
    }
  }

  function openWithdraw() {
    const last = w?.last_details ?? {};
    setWdMethod(last.method === "upi" ? "upi" : "bank");
    setWdFields({ holder: last.holder ?? "", bank: last.bank ?? "", account: last.account ?? "", ifsc: last.ifsc ?? "", upi: last.upi ?? "" });
    setWdOpen(true);
  }

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

  const gate = usePromoterGate();
  if (gate) return gate;

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

          {/* segment chips — bug report 20: four labels ending in "Wallet" are
              wider than the screen, so the last one was cut off. Wrapping is
              the pattern this app already settled on for the explorer chips:
              a horizontal scroller technically works, but testers read the
              clipped edge as broken rather than as an affordance. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: space.sm }}>
            {SEGMENTS.map((x) => (
              <Chip key={x.key} label={x.label} on={seg === x.key} onPress={() => setSeg(x.key)} />
            ))}
          </View>

          {/* totals */}
          {seg === "wallet" ? (
            <View style={{ gap: space.sm, marginBottom: space.sm }}>
              {/* balance hero */}
              <Card style={{ backgroundColor: colors.navy, borderColor: colors.navy, overflow: "hidden" }}>
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: T.caption.fontSize + 1, fontWeight: "700", letterSpacing: 0.6 }}>WALLET BALANCE</Text>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 30, marginTop: 4 }}>{formatINR(w?.balance ?? 0)}</Text>
                <View style={{ flexDirection: "row", gap: space.md, marginTop: space.sm, flexWrap: "wrap" }}>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: T.caption.fontSize + 1 }}>Pending income {formatINR(w?.pending_income ?? 0)}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: T.caption.fontSize + 1 }}>On hold {formatINR(w?.on_hold ?? 0)}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: T.caption.fontSize + 1 }}>Withdrawn {formatINR(w?.withdrawn ?? 0)}</Text>
                </View>
                <Pressable
                  onPress={wdOpen ? () => setWdOpen(false) : openWithdraw}
                  style={{ marginTop: space.md, backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                >
                  <Ionicons name={wdOpen ? "close" : "cash-outline"} size={17} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.small.fontSize + 1 }}>{wdOpen ? "Cancel" : "Withdraw funds"}</Text>
                </Pressable>
              </Card>

              {/* withdrawal form */}
              {wdOpen ? (
                <Card style={{ gap: space.xs }}>
                  <Text style={{ color: colors.ink, fontWeight: "800", fontSize: T.small.fontSize + 1 }}>New withdrawal request</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>
                    Available {formatINR(w?.balance ?? 0)} · minimum {formatINR(w?.min_withdrawal ?? 100)}
                  </Text>
                  <TextInput
                    value={wdAmount}
                    onChangeText={setWdAmount}
                    keyboardType="numeric"
                    placeholder="Amount (₹)"
                    placeholderTextColor={colors.inkFaint}
                    style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: T.body.fontSize, color: colors.ink, fontWeight: "700" }}
                  />
                  <View style={{ flexDirection: "row", gap: space.xs }}>
                    {(["bank", "upi"] as const).map((m) => (
                      <Chip key={m} label={m === "bank" ? "Bank transfer" : "UPI"} on={wdMethod === m} onPress={() => setWdMethod(m)} />
                    ))}
                  </View>
                  {wdMethod === "bank" ? (
                    <View style={{ gap: space.xs }}>
                      {([["holder", "Account holder name"], ["bank", "Bank name"], ["account", "Account number"], ["ifsc", "IFSC code"]] as const).map(([k, ph]) => (
                        <TextInput
                          key={k}
                          value={wdFields[k] ?? ""}
                          onChangeText={(v) => setWdFields((f) => ({ ...f, [k]: v }))}
                          placeholder={ph}
                          placeholderTextColor={colors.inkFaint}
                          autoCapitalize={k === "ifsc" ? "characters" : "words"}
                          style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: T.small.fontSize, color: colors.ink }}
                        />
                      ))}
                    </View>
                  ) : (
                    <TextInput
                      value={wdFields.upi ?? ""}
                      onChangeText={(v) => setWdFields((f) => ({ ...f, upi: v }))}
                      placeholder="UPI ID (name@bank)"
                      placeholderTextColor={colors.inkFaint}
                      autoCapitalize="none"
                      style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: T.small.fontSize, color: colors.ink }}
                    />
                  )}
                  <Pressable
                    disabled={wdBusy}
                    onPress={submitWithdrawal}
                    style={{ backgroundColor: wdBusy ? colors.inkFaint : colors.success, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 2 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.small.fontSize + 1 }}>{wdBusy ? "Submitting…" : "Submit request"}</Text>
                  </Pressable>
                </Card>
              ) : null}

              <View style={{ flexDirection: "row", gap: space.sm }}>
                <KpiTile icon="trending-up" label="Total earned" value={formatINR(w?.total_earnings ?? walletTotal)} tint={colors.brandSoft} accent={colors.brand} />
                <KpiTile icon="hourglass" label="Pending" value={formatINR(w?.pending_income ?? 0)} tint={colors.goldSoft} accent={colors.goldDark} />
              </View>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <KpiTile icon="lock-closed" label="Locked" value={formatINR(lockedTotal)} tint={colors.goldSoft} accent={colors.goldDark} />
                <KpiTile icon="checkmark-done" label="Withdrawn" value={formatINR(w?.withdrawn ?? s.withdrawn)} tint={colors.surfaceSunken} accent={colors.inkSoft} />
              </View>

              {/* my requests */}
              {(w?.requests ?? []).length ? (
                <Card style={{ gap: space.xs }}>
                  <Text style={{ color: colors.ink, fontWeight: "800", fontSize: T.small.fontSize + 1 }}>Withdrawal requests</Text>
                  {(w?.requests ?? []).map((r) => {
                    const tone = WD_TONE[r.status] ?? WD_TONE.pending;
                    return (
                      <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: T.small.fontSize + 1 }}>{formatINR(r.amount)}</Text>
                          <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>
                            {r.method === "upi" ? "UPI" : "Bank"} · {timeAgo(r.created_at)}{r.remarks ? ` · ${r.remarks}` : ""}
                          </Text>
                        </View>
                        <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: tone.fg, fontWeight: "800", fontSize: T.caption.fontSize + 1 }}>{tone.label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              ) : null}
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

          {/* advanced filters (owner spec 29-07): presets + custom range +
              status + search, applied instantly to totals AND history */}
          {filterActive ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.navy, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: space.xs }}>
              <Ionicons name="funnel" size={14} color={colors.goldLight ?? colors.gold} />
              <Text style={{ flex: 1, color: "#fff", fontSize: T.caption.fontSize + 1, fontWeight: "700" }} numberOfLines={1}>
                Filter: {activeLabel} · {s.tx_count ?? 0} {Number(s.tx_count) === 1 ? "entry" : "entries"}
              </Text>
              <Pressable onPress={clearFilters} hitSlop={6} style={{ backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: "#fff", fontSize: T.caption.fontSize, fontWeight: "800" }}>Clear</Text>
              </Pressable>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }} style={{ marginBottom: space.xs, flexGrow: 0 }}>
            {RANGES.map((r) => (
              <Chip key={r.key} label={r.label} on={range === r.key} onPress={() => setRange(r.key)} />
            ))}
          </ScrollView>

          {range === "custom" ? (
            <View style={{ flexDirection: "row", gap: space.xs, marginBottom: space.xs }}>
              <TextInput
                value={customFrom}
                onChangeText={(v) => { setCustomFrom(v); sessionFilter.from = v; }}
                placeholder="From · dd/mm/yyyy"
                placeholderTextColor={colors.inkFaint}
                style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: parseDMY(customFrom) || !customFrom ? colors.border : colors.brand, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: T.small.fontSize, color: colors.ink }}
              />
              <TextInput
                value={customTo}
                onChangeText={(v) => { setCustomTo(v); sessionFilter.to = v; }}
                placeholder="To · dd/mm/yyyy"
                placeholderTextColor={colors.inkFaint}
                style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: parseDMY(customTo) || !customTo ? colors.border : colors.brand, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: T.small.fontSize, color: colors.ink }}
              />
            </View>
          ) : null}

          {/* "All statuses · Pending · Approved · Paid" overflowed the same way. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: space.xs }}>
            {STATUS_FILTERS.map((x) => (
              <Chip key={x.key} label={x.label} on={statusF === x.key} onPress={() => setStatusF(x.key)} />
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, marginBottom: space.xs }}>
            <Ionicons name="search" size={15} color={colors.inkFaint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search reference no. or description…"
              placeholderTextColor={colors.inkFaint}
              style={{ flex: 1, paddingVertical: 9, paddingHorizontal: 8, fontSize: T.small.fontSize, color: colors.ink }}
            />
            {search ? (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={colors.inkFaint} />
              </Pressable>
            ) : null}
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
