import { useCallback } from "react";
import { Text, View, Pressable, Alert, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { Badge } from "@/components/premium";
import { BecomePromoterBanner } from "@/components/promoter-cta";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { useUnreadMessages, useRealtimeInbox } from "@/lib/messaging";
import { colors, space, type as T } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { initials } from "@/lib/format";
import { ROLE_LABELS, KYC_STATUS_META } from "@/lib/types";

const KYC_TONE: Record<"neutral" | "warning" | "success" | "danger", { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceSunken, fg: colors.inkSoft },
  warning: { bg: colors.goldSoft, fg: colors.goldDark },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.brandSoft, fg: colors.brand },
};

const ID_LABEL: Record<string, string> = { buyer: "Buyer ID", promoter: "Promoter ID", super_admin: "Member ID" };

export default function Account() {
  const router = useRouter();
  const { profile, signOut, refreshProfile } = useAuth();
  const role = useEffectiveRole();
  const themeMode = useTheme((t) => t.mode);
  const toggleTheme = useTheme((t) => t.toggle);
  const { data: unread = 0 } = useUnreadMessages(!!profile?.id);
  useRealtimeInbox(!!profile?.id);

  // Owner report 29-07: an admin approval (KYC / partner verification) changed
  // the DB but the screen kept showing the cached "under review" state until a
  // re-login. Re-reading the profile whenever this tab regains focus makes
  // approvals appear as soon as the user comes back to it.
  useFocusEffect(
    useCallback(() => {
      refreshProfile().catch(() => {});
    }, [refreshProfile]),
  );

  type Row = { icon: string; label: string; badge?: number; onPress: () => void };

  // Owner directive 05-08: "a buyer is a buyer, a promoter is a promoter — do
  // not mix". This menu used to open with a hardcoded "My dashboard" pointing
  // at /buyer/dashboard for EVERY role, with the promoter's own dashboard
  // tacked on at the bottom — so a promoter's account read as a buyer's. Each
  // role now leads with its OWN dashboard and its OWN tools; only genuinely
  // shared features (messages, community, saved, profile, assistant, guides)
  // appear for both.
  const isPromoter = role === "promoter";

  const rows: Row[] = [
    isPromoter
      ? { icon: "briefcase", label: "My promoter dashboard", onPress: () => router.push("/promoter") }
      : { icon: "grid", label: "My dashboard", onPress: () => router.push("/buyer/dashboard" as Href) },
  ];

  // KYC entry — both roles, label reflects current status.
  if (profile && profile.kyc_status !== "approved") {
    rows.push({
      icon: "shield-checkmark",
      label: profile.kyc_status === "pending" ? "KYC — under review" : profile.kyc_status === "rejected" ? "KYC — action needed" : "Complete your KYC",
      onPress: () => router.push("/buyer/kyc" as Href),
    });
  }

  // --- the role's own workspace ---
  if (isPromoter) {
    rows.push(
      { icon: "cash", label: "Sales income", onPress: () => router.push("/promoter/income" as Href) },
      { icon: "wallet", label: "Earnings & commissions", onPress: () => router.push("/promoter/earnings" as Href) },
      { icon: "git-network", label: "My earning tree", onPress: () => router.push("/promoter/tree" as Href) },
      { icon: "id-card", label: "My digital card", onPress: () => router.push("/promoter/card" as Href) },
      { icon: "business", label: "Projects to promote", onPress: () => router.push("/promoter/explorer" as Href) },
      { icon: "add-circle", label: "Submit a property", onPress: () => router.push("/promoter/leads" as Href) },
      { icon: "calendar-outline", label: "Site visit desk", onPress: () => router.push("/manage-visits" as Href) },
    );
  } else {
    rows.push(
      { icon: "options", label: "Buyer preferences", onPress: () => router.push("/buyer/onboarding") },
      { icon: "heart-circle", label: "My interests", onPress: () => router.push("/interests" as Href) },
    );
  }

  // Bug report 21: anyone can book a site visit, so everyone needs somewhere to
  // track their own bookings. Promoters only had the DESK ("visits assigned to
  // you"), which never lists the visits they booked themselves — their own
  // bookings were unreachable from anywhere in the app.
  rows.push({ icon: "calendar", label: "My site visits", onPress: () => router.push("/visits" as Href) });

  // --- shared by everyone ---
  rows.push(
    { icon: "chatbubbles", label: "Messages", badge: unread, onPress: () => router.push("/messages" as Href) },
    { icon: "heart", label: isPromoter ? "Saved projects" : "My wishlist", onPress: () => router.push("/saved" as Href) },
    { icon: "people-circle", label: "Jamin Community", onPress: () => router.push("/community" as Href) },
    { icon: "gift", label: "Referral centre", onPress: () => router.push("/referral" as Href) },
    { icon: "person-circle", label: "Edit profile", onPress: () => router.push("/profile") },
    { icon: "notifications", label: "Notifications", onPress: () => router.push("/notifications" as Href) },
    { icon: "sparkles", label: "Jamindar assistant", onPress: () => router.navigate("/(tabs)/assistant") },
    { icon: "mic", label: "Jamindar voice settings", onPress: () => router.push("/jamindar/settings") },
    { icon: "calculator", label: "Calculators", onPress: () => router.push("/tools/calculators") },
    { icon: "git-compare", label: "Compare properties", onPress: () => router.push("/tools/compare") },
    { icon: "document-text", label: "Legal guide", onPress: () => router.push("/tools/legal") },
    { icon: "help-buoy", label: "Support", onPress: () => router.push("/support" as Href) },
  );

  // Admin console is always reachable for real super admins, even while previewing another role.
  if (profile?.role === "super_admin") rows.push({ icon: "shield-checkmark", label: "Admin console", onPress: () => router.push("/admin") });

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut().then(() => router.replace("/welcome")) },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <Card style={{ alignItems: "center", paddingVertical: space.lg, marginBottom: space.md }}>
          <Pressable
            onPress={() => router.push("/profile")}
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              borderWidth: 3,
              borderColor: colors.brandSoft,
            }}
          >
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <Text style={{ color: "#fff", fontSize: 32, fontWeight: "800" }}>{initials(profile?.full_name)}</Text>
            )}
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>
              {profile?.full_name ?? "Guest"}
            </Text>
            {/* Bug report 17 (HIGH): this tick was unconditional, so an account
                sitting at "KYC pending review" still looked verified — the pill
                right below it said the opposite. The tick is the claim that the
                identity has been checked, so it waits for the approval. */}
            {profile?.kyc_status === "approved" ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            ) : null}
          </View>
          <Text style={{ color: colors.inkFaint, marginTop: 2, fontSize: 13 }}>+{profile?.mobile}</Text>

          {/* Super admins carry no generated ID — the role pill below already
              says "Super Admin" (owner directive, audit round 29-07). */}
          {profile?.member_code && profile.role !== "super_admin" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: colors.surfaceSunken, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
              <Ionicons name="finger-print" size={13} color={colors.inkFaint} />
              <Text style={{ color: colors.inkSoft, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 }}>
                {ID_LABEL[profile.role] ?? "Member ID"} · {profile.member_code}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8, marginTop: space.sm, flexWrap: "wrap", justifyContent: "center" }}>
            <Badge label={ROLE_LABELS[role].toUpperCase()} tone="role" />
            {(() => {
              const meta = KYC_STATUS_META[profile?.kyc_status ?? "not_started"];
              const tone = KYC_TONE[meta.tone];
              return (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
                  <Ionicons name={meta.icon as any} size={13} color={tone.fg} />
                  <Text style={{ color: tone.fg, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>{meta.label.toUpperCase()}</Text>
                </View>
              );
            })()}
          </View>
        </Card>

        {/* Role preview moved to the Admin console — testing tool, not live UI. */}

        {/* upgrade to promoter — buyers only */}
        <View style={{ marginBottom: space.md }}>
          <BecomePromoterBanner />
        </View>

        <Card style={{ padding: 0 }}>
          {/* Appearance — light stays the default; dark is opt-in and remembered. */}
          <Pressable
            onPress={toggleTheme}
            style={{
              flexDirection: "row", alignItems: "center", gap: 14,
              paddingVertical: 16, paddingHorizontal: 16,
            }}
          >
            <Ionicons name={themeMode === "dark" ? "moon" : "sunny"} size={22} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: T.callout.fontSize, fontWeight: "600", color: colors.ink }}>Dark mode</Text>
              <Text style={{ fontSize: T.micro.fontSize, color: colors.inkFaint, marginTop: 1 }}>
                {themeMode === "dark" ? "On — platinum on graphite" : "Off — the app stays light"}
              </Text>
            </View>
            {/* A real switch track, so its state is obvious without reading. */}
            <View
              style={{
                width: 46, height: 27, borderRadius: 14, padding: 3,
                backgroundColor: themeMode === "dark" ? colors.brand : colors.surfaceSunken,
                alignItems: themeMode === "dark" ? "flex-end" : "flex-start",
              }}
            >
              <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: "#fff" }} />
            </View>
          </Pressable>

          {rows.map((r, i) => (
            <Pressable
              key={r.label}
              onPress={r.onPress}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 16,
                paddingHorizontal: 16,
                borderTopWidth: i === 0 ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name={r.icon as any} size={22} color={colors.brand} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink }}>{r.label}</Text>
              {r.badge && r.badge > 0 ? (
                <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{r.badge}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </Pressable>
          ))}
        </Card>

        <Pressable
          onPress={confirmSignOut}
          style={{
            marginTop: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Sign out</Text>
        </Pressable>

        <Text style={{ textAlign: "center", color: colors.inkFaint, fontSize: 12, marginTop: 24 }}>
          Jamin Bazaar · Signature for Fortune
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
