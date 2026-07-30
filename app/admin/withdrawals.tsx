import { useState } from "react";
import { Text, View, ScrollView, Pressable, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Loading } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR, timeAgo } from "@/lib/format";
import { useAdminGate } from "@/components/AdminGate";

/** Admin — Wallet & Withdrawals (migration 0059). Mirrors the web console:
 *  the same RPCs drive both, so an action on either platform is instantly
 *  visible on the other. Marking a request paid deducts the promoter's
 *  wallet server-side and notifies them in-app. */

type Row = {
  id: string; user_id: string; full_name: string | null; member_code: string | null; mobile: string | null;
  amount: number; method: string; details: Record<string, string>; status: string; remarks: string | null;
  balance: number; withdrawn: number; created_at: string; decided_at: string | null; paid_at: string | null;
};

const STATUSES = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "declined", label: "Declined" },
];

const TONE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: colors.goldSoft, fg: colors.goldDark, label: "Pending" },
  approved: { bg: "#E8F1FE", fg: "#2B6FE1", label: "Approved" },
  paid: { bg: colors.successSoft, fg: colors.success, label: "Paid" },
  declined: { bg: colors.brandSoft, fg: colors.brand, label: "Declined" },
};

export default function AdminWithdrawals() {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-withdrawals", status],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("bazaar_admin_withdrawals", status ? { p_status: status } : {});
      if (error) throw error;
      return (data as Row[]) ?? [];
    },
  });

  async function act(id: string, action: "approve" | "decline" | "paid", remarks?: string) {
    setBusy(id);
    try {
      const { data, error } = await supabase.rpc("bazaar_admin_withdrawal_action", {
        p_id: id, p_action: action, p_remarks: remarks ?? null,
      });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (!r.ok) { Alert.alert("Withdrawal", r.error ?? "Action failed."); return; }
      setDeclineFor(null); setDeclineReason("");
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["admin-pending-counts"] });
    } catch (e: any) {
      Alert.alert("Withdrawal", e?.message ?? "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function confirmPaid(row: Row) {
    Alert.alert(
      "Mark as paid?",
      `${formatINR(row.amount)} will be deducted from ${row.full_name ?? "the promoter"}'s wallet immediately and they will be notified.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark paid", style: "destructive", onPress: () => act(row.id, "paid") },
      ],
    );
  }

  // Someone remits real money off this line, so show it in the order a bank
  // form asks for it and with readable labels rather than raw keys. Anything
  // unrecognised still shows, so a new field can never go silently missing.
  const DETAIL_LABELS: [string, string][] = [
    ["holder", "Account holder"],
    ["bank", "Bank"],
    ["account", "A/c no."],
    ["ifsc", "IFSC"],
    ["upi", "UPI"],
  ];
  const detailLine = (r: Row) => {
    const d = r.details ?? {};
    const known = new Set(DETAIL_LABELS.map(([k]) => k));
    const parts = [
      ...DETAIL_LABELS.filter(([k]) => d[k]).map(([k, label]) => `${label}: ${d[k]}`),
      ...Object.entries(d).filter(([k, v]) => v && k !== "method" && !known.has(k)).map(([k, v]) => `${k}: ${v}`),
    ];
    return parts.length ? parts.join(" · ") : "No payment details given";
  };

  const adminGate = useAdminGate();
  if (adminGate) return adminGate;

  const pendingCount = (rows ?? []).filter((r) => r.status === "pending").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Wallet & Withdrawals</Text>
          <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>
            {pendingCount ? `${pendingCount} awaiting review` : "All requests reviewed"}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.md }} style={{ flexGrow: 0, marginBottom: space.xs }}>
        {STATUSES.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setStatus(s.key)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: status === s.key ? colors.ink : colors.surface, borderWidth: 1, borderColor: status === s.key ? colors.ink : colors.border }}
          >
            <Text style={{ color: status === s.key ? "#fff" : colors.inkSoft, fontWeight: "700", fontSize: T.small.fontSize }}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <Loading label="Loading requests…" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl, gap: space.sm }} showsVerticalScrollIndicator={false}>
          {(rows ?? []).length === 0 ? (
            <Card style={{ alignItems: "center", paddingVertical: space.xl }}>
              <Ionicons name="wallet-outline" size={34} color={colors.inkFaint} />
              <Text style={{ color: colors.inkFaint, marginTop: 8, fontSize: T.small.fontSize }}>
                No withdrawal requests{status ? ` (${status})` : ""} yet.
              </Text>
            </Card>
          ) : (
            (rows ?? []).map((r) => {
              const tone = TONE[r.status] ?? TONE.pending;
              return (
                <Card key={r.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.ink, fontWeight: "800", fontSize: T.small.fontSize + 2 }} numberOfLines={1}>
                        {r.full_name ?? "Promoter"}
                      </Text>
                      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }} numberOfLines={1}>
                        {[r.member_code, r.mobile].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: tone.fg, fontWeight: "800", fontSize: T.caption.fontSize + 1 }}>{tone.label}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
                    <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 20 }}>{formatINR(r.amount)}</Text>
                    <View>
                      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>Wallet balance {formatINR(r.balance)}</Text>
                      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>Withdrawn to date {formatINR(r.withdrawn)}</Text>
                    </View>
                  </View>

                  <Text style={{ color: colors.inkSoft, fontSize: T.caption.fontSize + 1 }}>
                    {(r.method === "upi" ? "UPI" : r.method === "bank" ? "Bank transfer" : "Other")} · {detailLine(r)}
                  </Text>
                  <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>
                    Requested {timeAgo(r.created_at)}{r.remarks ? ` · Remarks: ${r.remarks}` : ""}
                  </Text>

                  {r.status === "pending" || r.status === "approved" ? (
                    declineFor === r.id ? (
                      <View style={{ gap: space.xs }}>
                        <TextInput
                          value={declineReason}
                          onChangeText={setDeclineReason}
                          placeholder="Reason for declining (shown to the promoter)"
                          placeholderTextColor={colors.inkFaint}
                          style={{ backgroundColor: colors.surfaceSunken, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: T.small.fontSize, color: colors.ink }}
                        />
                        <View style={{ flexDirection: "row", gap: space.xs }}>
                          <Pressable
                            disabled={busy === r.id}
                            onPress={() => act(r.id, "decline", declineReason.trim() || undefined)}
                            style={{ flex: 1, backgroundColor: colors.brand, borderRadius: 11, paddingVertical: 10, alignItems: "center" }}
                          >
                            <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.small.fontSize }}>Confirm decline</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => { setDeclineFor(null); setDeclineReason(""); }}
                            style={{ flex: 1, backgroundColor: colors.surfaceSunken, borderRadius: 11, paddingVertical: 10, alignItems: "center" }}
                          >
                            <Text style={{ color: colors.inkSoft, fontWeight: "700", fontSize: T.small.fontSize }}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
                        {r.status === "pending" ? (
                          <Pressable
                            disabled={busy === r.id}
                            onPress={() => act(r.id, "approve")}
                            style={{ flex: 1, minWidth: 100, backgroundColor: colors.success, borderRadius: 11, paddingVertical: 10, alignItems: "center" }}
                          >
                            <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.small.fontSize }}>Approve</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          disabled={busy === r.id}
                          onPress={() => confirmPaid(r)}
                          style={{ flex: 1, minWidth: 100, backgroundColor: colors.goldDark, borderRadius: 11, paddingVertical: 10, alignItems: "center" }}
                        >
                          <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.small.fontSize }}>Mark paid</Text>
                        </Pressable>
                        {r.status === "pending" ? (
                          <Pressable
                            disabled={busy === r.id}
                            onPress={() => { setDeclineFor(r.id); setDeclineReason(""); }}
                            style={{ flex: 1, minWidth: 100, backgroundColor: colors.surfaceSunken, borderRadius: 11, paddingVertical: 10, alignItems: "center" }}
                          >
                            <Text style={{ color: colors.inkSoft, fontWeight: "700", fontSize: T.small.fontSize }}>Decline</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
