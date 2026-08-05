import { useCallback } from "react";
import { Text, View, ScrollView, Pressable, Image, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Button, Empty } from "@/components/ui";
import { JamindarFab } from "@/components/Jamindar";
import { usePromoterGate } from "@/components/PromoterGate";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR, timeAgo } from "@/lib/format";
import { IMG } from "@/lib/img";
import {
  fetchSubmission,
  canEditSubmission,
  SUBMISSION_STATUS,
  type Submission,
} from "@/lib/submissions";

const TONE: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceSunken, fg: colors.inkSoft },
  info: { bg: "#E8F1FE", fg: "#1C5BC4" },
  warning: { bg: colors.goldSoft, fg: colors.goldDark },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.brandSoft, fg: colors.brand },
};

/**
 * The full record of one property a promoter submitted.
 *
 * Bug report 20: My Submissions showed a summary card and stopped there — no
 * way to check what had actually been sent, and no way to correct a wrong
 * price or a missing photo. This is the "open and preview" half; the Edit
 * button reopens the submit form with everything prefilled.
 *
 * Editing is offered only while the database would accept it. The
 * `ps_update_own` policy allows a promoter to write to their own row only in
 * the 'submitted' and 'info_required' states, so once the admin starts the
 * review or decides, the button is replaced by an explanation rather than a
 * control that would fail.
 */
export default function SubmissionDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["submission", id],
    enabled: !!id,
    queryFn: () => fetchSubmission(String(id)),
  });

  // Coming back from the edit form should show the saved version.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const gate = usePromoterGate();
  if (gate) return gate;

  const s = data as Submission | null | undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>
          Submitted property
        </Text>
      </View>

      {isLoading ? (
        <Loading label="Opening your submission…" />
      ) : !s ? (
        <Empty title="Not found" subtitle="This submission is no longer available." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
          {/* status + what the review said */}
          <Card style={{ marginBottom: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
              <StatusPill status={s.status} />
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>
                sent {timeAgo(s.created_at)}
                {s.updated_at && s.updated_at !== s.created_at ? ` · updated ${timeAgo(s.updated_at)}` : ""}
              </Text>
            </View>
            {s.review_reason ? (
              <View style={{ flexDirection: "row", gap: 10, backgroundColor: colors.goldSoft, borderRadius: 12, padding: 12, marginTop: space.sm }}>
                <Ionicons name="chatbubble-ellipses" size={17} color={colors.goldDark} />
                <Text style={{ flex: 1, color: colors.ink, fontSize: T.small.fontSize, lineHeight: 20 }}>{s.review_reason}</Text>
              </View>
            ) : null}
          </Card>

          {/* photos */}
          {s.images?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingBottom: space.sm }}>
              {s.images.map((uri, i) => (
                <Image key={uri + i} source={{ uri: IMG.card(uri) }} style={{ width: 172, height: 124, borderRadius: 14, backgroundColor: colors.surfaceSunken }} />
              ))}
            </ScrollView>
          ) : null}

          <Section title="Property">
            <Row label="Title" value={s.title} />
            <Row label="Type" value={s.property_type} />
            <Row label="Price" value={s.price != null ? formatINR(s.price) : null} />
            <Row label="Area" value={s.area_value != null ? `${s.area_value} ${s.area_unit ?? ""}`.trim() : null} />
            <Row label="Description" value={s.description} />
          </Section>

          <Section title="Location">
            <Row label="Address" value={s.address} />
            <Row label="Locality" value={s.locality} />
            <Row label="City" value={s.city} />
            <Row label="District" value={s.district} />
            <Row label="State" value={s.state} />
            <Row label="PIN" value={s.pincode} />
            <Row label="GPS" value={s.lat != null && s.lng != null ? `${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}` : null} />
            {s.gmaps_url ? <LinkRow label="Google Maps" url={s.gmaps_url} /> : null}
            {s.street_view_url ? <LinkRow label="Street View" url={s.street_view_url} /> : null}
          </Section>

          {s.videos?.length || s.documents?.length ? (
            <Section title="Media & documents">
              {s.videos?.map((v, i) => <LinkRow key={v + i} label={`Video ${i + 1}`} url={v} />)}
              {s.documents?.map((d, i) => <LinkRow key={d.url + i} label={d.label || `Document ${i + 1}`} url={d.url} />)}
            </Section>
          ) : null}

          <Section title="Seller">
            <Row label="Name" value={s.seller_name} />
            <Row label="Phone" value={s.seller_phone} />
            <Row label="Notes" value={s.seller_notes} />
          </Section>

          {s.notes || s.comments ? (
            <Section title="Your notes">
              <Row label="Notes" value={s.notes} />
              <Row label="For the review team" value={s.comments} />
            </Section>
          ) : null}

          {canEditSubmission(s) ? (
            <>
              <Button
                label="Edit & resubmit"
                onPress={() => router.push({ pathname: "/promoter/submit", params: { id: s.id } } as Href)}
                style={{ marginTop: space.sm }}
              />
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, textAlign: "center", marginTop: space.xs, lineHeight: 18 }}>
                Saving your changes sends the corrected version back for review and replaces this one.
              </Text>
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginTop: space.sm }}>
              <Ionicons name="lock-closed" size={17} color={colors.inkFaint} />
              <Text style={{ flex: 1, color: colors.inkSoft, fontSize: T.small.fontSize, lineHeight: 20 }}>
                {s.status === "under_review"
                  ? "The Jamin team is reviewing this now, so it can't be changed. If something needs correcting, ask them to send it back to you."
                  : "This submission has been decided and can no longer be edited. Submit a new property if you need to make changes."}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
      <JamindarFab />
    </SafeAreaView>
  );
}

function StatusPill({ status }: { status: Submission["status"] }) {
  const meta = SUBMISSION_STATUS[status];
  const tone = TONE[meta.tone] ?? TONE.neutral;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Ionicons name={meta.icon as any} size={13} color={tone.fg} />
      <Text style={{ color: tone.fg, fontSize: T.caption.fontSize + 1, fontWeight: "700" }}>{meta.label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: space.sm }}>
      <Text style={{ fontSize: T.small.fontSize + 1, fontWeight: "800", color: colors.ink, marginBottom: space.xs }}>{title}</Text>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.surfaceSunken }}>
      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: "600", fontSize: T.small.fontSize + 1, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.surfaceSunken }}
    >
      <Ionicons name="open-outline" size={16} color={colors.brand} />
      <Text numberOfLines={1} style={{ flex: 1, color: colors.brand, fontWeight: "600", fontSize: T.small.fontSize + 1 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
    </Pressable>
  );
}
