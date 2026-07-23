import { useEffect, useState } from "react";
import { Text, View, ScrollView, Pressable, Image, Alert, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import { signedKycUrl } from "@/lib/kyc";
import type { KycSubmission } from "@/lib/types";

type Row = KycSubmission & {
  applicant: { full_name: string | null; member_code: string | null; mobile: string | null } | null;
};

const STATUSES = ["pending", "approved", "rejected"] as const;
const DOC_FIELDS: { key: keyof KycSubmission; label: string }[] = [
  { key: "pan_doc", label: "PAN card" },
  { key: "aadhaar_front", label: "Aadhaar front" },
  { key: "aadhaar_back", label: "Aadhaar back" },
  { key: "bank_proof", label: "Bank proof" },
  { key: "nominee_pan_doc", label: "Nominee PAN" },
  { key: "nominee_aadhaar_front", label: "Nominee Aadhaar front" },
  { key: "nominee_aadhaar_back", label: "Nominee Aadhaar back" },
];

export default function AdminKyc() {
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>("pending");
  const [selected, setSelected] = useState<Row | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-kyc", filter],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from("kyc_submissions")
        .select("*, applicant:profiles!kyc_submissions_user_id_fkey(full_name, member_code, mobile)")
        .eq("status", filter)
        .order("submitted_at", { ascending: false })
        .limit(50);
      return (data as Row[]) ?? [];
    },
  });

  if (selected) {
    return <Detail row={selected} onBack={() => setSelected(null)} onReviewed={() => { setSelected(null); qc.invalidateQueries({ queryKey: ["admin-kyc"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>KYC Verifications</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 6 }}>
        {STATUSES.map((s) => {
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
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {rows && rows.length > 0 ? (
            rows.map((r) => (
              <Card key={r.id} onPress={() => setSelected(r)} style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person" size={20} color={colors.inkFaint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: colors.ink }} numberOfLines={1}>{r.applicant?.full_name ?? "Applicant"}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>
                    {[r.applicant?.member_code, r.applicant?.mobile ? `+${r.applicant.mobile}` : null].filter(Boolean).join(" · ") || "—"}
                  </Text>
                </View>
                <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{timeAgo(r.submitted_at)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              </Card>
            ))
          ) : (
            <Empty title={`No ${filter} submissions`} subtitle="They'll appear here as buyers submit their KYC." />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Detail({ row, onBack, onReviewed }: { row: Row; onBack: () => void; onReviewed: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const entries: Record<string, string> = {};
      for (const d of DOC_FIELDS) {
        const path = row[d.key] as string | null;
        if (path) {
          const url = await signedKycUrl(path);
          if (url) entries[d.key as string] = url;
        }
      }
      if (active) setUrls(entries);
    })();
    return () => { active = false; };
  }, [row.id]);

  async function review(decision: "approved" | "rejected") {
    if (decision === "rejected" && !reason.trim()) {
      Alert.alert("Reason required", "Please enter a reason so the applicant knows what to correct.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_review_kyc", {
        p_submission: row.id,
        p_decision: decision,
        p_reason: decision === "rejected" ? reason.trim() : null,
        p_corrections: null,
      });
      if (error) throw error;
      Alert.alert(decision === "approved" ? "KYC approved" : "KYC rejected", "The applicant has been notified.", [{ text: "OK", onPress: onReviewed }]);
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={onBack} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Review KYC</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Card style={{ marginBottom: space.md }}>
          <Text style={{ fontSize: T.body.fontSize, fontWeight: "600", color: colors.ink }}>{row.applicant?.full_name ?? "Applicant"}</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 13, marginTop: 2 }}>
            {[row.applicant?.member_code, row.applicant?.mobile ? `+${row.applicant.mobile}` : null].filter(Boolean).join(" · ")}
          </Text>
        </Card>

        <DetailSection title="Identity" rows={[["PAN", row.pan_number], ["Aadhaar", row.aadhaar_number]]} />
        <DetailSection title="Courier address" rows={[
          ["Address", [row.addr_house, row.addr_street, row.addr_landmark, row.addr_area].filter(Boolean).join(", ")],
          ["City", row.addr_city], ["District", row.addr_district], ["State", row.addr_state], ["PIN", row.addr_pincode],
        ]} />
        <DetailSection title="Bank" rows={[
          ["Holder", row.bank_account_name], ["Account", row.bank_account_number], ["IFSC", row.bank_ifsc],
          ["Bank", row.bank_name], ["Branch", row.bank_branch], ["UPI", row.upi_id],
        ]} />
        <DetailSection title="Nominee" rows={[
          ["Name", row.nominee_name], ["Relationship", row.nominee_relationship], ["Phone", row.nominee_phone],
          ["Email", row.nominee_email], ["PAN", row.nominee_pan], ["Aadhaar", row.nominee_aadhaar],
        ]} />

        {/* documents */}
        <Card style={{ marginBottom: space.md }}>
          <Text style={{ fontSize: T.body.fontSize, fontWeight: "600", color: colors.ink, marginBottom: space.sm }}>Documents</Text>
          {DOC_FIELDS.filter((d) => row[d.key]).length === 0 ? (
            <Text style={{ color: colors.inkFaint, fontSize: 13 }}>No documents attached.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {DOC_FIELDS.filter((d) => row[d.key]).map((d) => (
                <View key={d.key as string} style={{ width: "47%" }}>
                  <View style={{ height: 110, borderRadius: 12, backgroundColor: colors.surfaceSunken, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                    {urls[d.key as string] ? (
                      <Image source={{ uri: urls[d.key as string] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    ) : (
                      <ActivityIndicator color={colors.inkFaint} />
                    )}
                  </View>
                  <Text style={{ color: colors.inkFaint, fontSize: 11, marginTop: 4 }}>{d.label}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        {row.status === "pending" ? (
          <>
            <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 13, marginBottom: 6 }}>Rejection reason (required to reject)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Aadhaar image is blurred — please re-upload."
              placeholderTextColor={colors.inkFaint}
              multiline
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, minHeight: 70, fontSize: 15, color: colors.ink, marginBottom: space.md, textAlignVertical: "top" }}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Reject" variant="outline" onPress={() => review("rejected")} loading={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Approve" onPress={() => review("approved")} loading={busy} />
              </View>
            </View>
          </>
        ) : (
          <Card>
            <Text style={{ color: colors.inkSoft }}>
              Already {row.status}
              {row.review_reason ? ` — ${row.review_reason}` : ""}.
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailSection({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  const visible = rows.filter(([, v]) => v);
  if (visible.length === 0) return null;
  return (
    <Card style={{ marginBottom: space.md }}>
      <Text style={{ fontSize: T.body.fontSize, fontWeight: "600", color: colors.ink, marginBottom: space.sm }}>{title}</Text>
      {visible.map(([k, v]) => (
        <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 16 }}>
          <Text style={{ color: colors.inkFaint, fontSize: 13 }}>{k}</Text>
          <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" }} numberOfLines={2}>{v}</Text>
        </View>
      ))}
    </Card>
  );
}
