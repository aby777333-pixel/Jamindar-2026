import { Text, View, ScrollView, Pressable, Image, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, elevation } from "@/components/ui";
import { VerifiedListingCard } from "@/components/land";
import {
  PartnerBadge,
  VerificationBanner,
  KpiTile,
  ShortcutTile,
  EarningsCard,
  ReservedCard,
  PromoterSection,
  SoftEmpty,
} from "@/components/promoter";
import { JamindarFab } from "@/components/Jamindar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { useFavorites } from "@/lib/favorites";
import { ReferralSharing } from "@/components/ReferralSharing";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR, timeAgo, initials } from "@/lib/format";
import { fetchMyEarnings } from "@/lib/earnings";
import { teamInviteMessage } from "@/lib/referral";
import type { Property } from "@/lib/types";

/** Promoter Command Center — the anchor of the Promoter Module. Surfaces the
 *  full information architecture (verification, KPIs, earnings, projects,
 *  activity, quick actions) reading real data where it exists and showing
 *  honest zero/empty states elsewhere. Spacious by design: reserved cards mark
 *  where the ML earning tree and other modules will slot in without redesign. */
export default function PromoterDashboard() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.id;
  const favorites = useFavorites();

  const { data, isLoading } = useQuery({
    queryKey: ["promoter-dash", uid],
    enabled: !!uid,
    queryFn: async () => {
      const [promo, leads, visits, refEvents, activity, notifs, assigned, favs] = await Promise.all([
        supabase.from("promoter_profiles").select("*").eq("id", uid!).maybeSingle(),
        supabase.from("leads").select("*").eq("promoter_id", uid!).order("created_at", { ascending: false }),
        supabase.from("site_visits").select("*").eq("promoter_id", uid!).order("created_at", { ascending: false }),
        supabase.from("referral_events").select("*").eq("referrer_id", uid!).order("created_at", { ascending: false }).limit(50),
        supabase.from("activity_log").select("*").eq("user_id", uid!).order("created_at", { ascending: false }).limit(12),
        supabase.from("notifications").select("id,read_at").eq("user_id", uid!).is("read_at", null),
        supabase.from("properties").select("*").eq("promoter_id", uid!).order("created_at", { ascending: false }).limit(10),
        // Bug fix 28-07: the column is buyer_id — user_id errored silently,
        // leaving the Saved-projects rail permanently empty.
        supabase.from("favorites").select("*").eq("buyer_id", uid!).limit(20),
      ]);

      // Saved projects — resolve favorited property ids (defensive on column name).
      const favIds = (favs.data ?? [])
        .map((f: any) => f.property_id ?? f.property ?? null)
        .filter((x: string | null): x is string => !!x);
      let saved: Property[] = [];
      if (favIds.length) {
        const { data: savedRows } = await supabase.from("properties").select("*").in("id", favIds).limit(10);
        saved = (savedRows as Property[]) ?? [];
      }

      return {
        promo: promo.data,
        leads: leads.data ?? [],
        visits: visits.data ?? [],
        refEvents: refEvents.data ?? [],
        activity: activity.data ?? [],
        unread: (notifs.data ?? []).length,
        assigned: (assigned.data as Property[]) ?? [],
        saved,
      };
    },
  });

  const { data: earn } = useQuery({ queryKey: ["my-earnings", uid], enabled: !!uid, queryFn: fetchMyEarnings });

  if (isLoading || !data) return <Loading label="Loading your dashboard…" />;

  const leads = data.leads;
  const newLeads = leads.filter((l: any) => l.status === "new").length;
  const converted = leads.filter((l: any) => l.status === "converted").length;
  const activeBuyers = new Set(leads.map((l: any) => l.buyer_id).filter(Boolean)).size;
  const enquiries = data.refEvents.filter((e: any) => /enquir|interest|lead/i.test(e.event_type ?? "")).length || leads.length;
  const partnerStatus = profile?.partner_status ?? "none";
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "Partner";

  const shortcuts: { icon: string; label: string; to: Href; tint?: string; accent?: string }[] = [
    { icon: "cash", label: "Sales Income", to: "/promoter/income" as Href, tint: colors.successSoft, accent: colors.success },
    { icon: "id-card", label: "Digital Card", to: "/promoter/card" as Href, tint: colors.goldSoft, accent: colors.goldDark },
    { icon: "calendar", label: "Site visits", to: "/manage-visits" as Href, tint: "#F2EBFB", accent: "#7C4BC9" },
    { icon: "chatbubbles", label: "Messages", to: "/messages" as Href, tint: "#ECEEFB", accent: "#4B57C9" },
    { icon: "gift", label: "Referrals", to: "/referral" as Href },
    { icon: "business", label: "Projects", to: "/promoter/explorer" as Href },
    { icon: "add-circle", label: "Submit", to: "/promoter/leads" as Href },
    { icon: "shield-checkmark", label: "KYC", to: "/buyer/kyc" as Href, tint: colors.successSoft, accent: colors.success },
    { icon: "notifications", label: "Alerts", to: "/notifications" as Href },
    { icon: "help-buoy", label: "Support", to: "/support" as Href },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Promoter</Text>
        <Pressable onPress={() => router.push("/notifications" as Href)} hitSlop={8}>
          <Ionicons name="notifications-outline" size={23} color={colors.inkSoft} />
          {data.unread > 0 ? (
            <View style={{ position: "absolute", top: -2, right: -2, minWidth: 8, height: 8, borderRadius: 5, backgroundColor: colors.brand }} />
          ) : null}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        {/* welcome + profile hero */}
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>{initials(profile?.full_name)}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize }}>Namaste 🙏</Text>
            <Text numberOfLines={1} style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink, letterSpacing: -0.4 }}>
              {firstName}
            </Text>
            <View style={{ marginTop: 5 }}>
              <PartnerBadge status={partnerStatus} />
            </View>
          </View>
          {profile?.role === "super_admin" ? (
            // Owner directive (29-07): super admins show no generated ID — just the role.
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: colors.brand, fontSize: T.small.fontSize, fontWeight: "800", letterSpacing: 0.4 }}>SUPER ADMIN</Text>
            </View>
          ) : profile?.member_code ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize, fontWeight: "600", letterSpacing: 0.4 }}>PROMOTER ID</Text>
              <Text style={{ color: colors.ink, fontSize: T.small.fontSize + 1, fontWeight: "800", letterSpacing: 0.3, marginTop: 1 }}>{profile.member_code}</Text>
            </View>
          ) : null}
        </Card>

        <View style={{ marginTop: space.sm }}>
          <VerificationBanner status={partnerStatus} onAction={() => router.push("/buyer/kyc" as Href)} />
        </View>

        {/* Two ways to share (owner report 27-07): grow your team with your
            referral link, or promote a specific project with attribution. */}
        <View style={{ marginTop: space.md, flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => {
              const code = profile?.referral_code ?? profile?.partner_code;
              if (code) Share.share({ message: teamInviteMessage(code) }).catch(() => {});
            }}
            style={{ flex: 1, backgroundColor: colors.navy, borderRadius: space.md, padding: space.sm + 3, ...elevation.low }}
          >
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(224,164,35,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="people" size={18} color={colors.gold} />
            </View>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.small.fontSize + 1, marginTop: 9 }}>Build your team</Text>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: T.caption.fontSize + 1, marginTop: 2 }} numberOfLines={2}>
              Share your referral link & recruit
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/promoter/explorer" as Href)}
            style={{ flex: 1, backgroundColor: colors.brand, borderRadius: space.md, padding: space.sm + 3, ...elevation.low }}
          >
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="megaphone" size={18} color="#fff" />
            </View>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.small.fontSize + 1, marginTop: 9 }}>Promote a project</Text>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: T.caption.fontSize + 1, marginTop: 2 }} numberOfLines={2}>
              Pick a listing & share with your link
            </Text>
          </Pressable>
        </View>

        {/* earnings summary — real ledger totals (commission engine, migration 0017) */}
        <Pressable onPress={() => router.push("/promoter/earnings" as Href)} style={{ marginTop: space.md }}>
          <EarningsCard
            total={formatINR(earn?.total ?? 0)}
            pending={formatINR(earn?.pending ?? 0)}
            paid={formatINR(earn?.paid ?? 0)}
            caption={earn?.count ? `${earn.count} commission ${earn.count === 1 ? "entry" : "entries"} — tap to view history.` : "Earnings appear automatically as your network makes sales."}
          />
        </Pressable>

        {/* Earning Tree — flagship multi-level referral network */}
        <Pressable
          onPress={() => router.push("/promoter/tree" as Href)}
          style={{
            marginTop: space.md,
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            backgroundColor: colors.surface,
            borderRadius: space.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: space.sm + 2,
            ...elevation.low,
          }}
        >
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="git-network" size={22} color={colors.goldDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", fontSize: T.small.fontSize + 1, color: colors.ink }}>Earning Tree</Text>
            <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }}>Your multi-level referral network, levelwise.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
        </Pressable>

        {/* KPI grid — each card opens its underlying records (bug 28-07) */}
        <PromoterSection title="Your performance">
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <KpiTile icon="chatbubbles" label="Enquiries" value={enquiries} tint={colors.brandSoft} accent={colors.brand} onPress={() => router.push("/promoter/leads-list" as Href)} />
              <KpiTile icon="people" label="Total leads" value={leads.length} tint="#ECEEFB" accent="#4B57C9" onPress={() => router.push("/promoter/leads-list" as Href)} />
              <KpiTile icon="flame" label="New" value={newLeads} tint={colors.goldSoft} accent={colors.goldDark} onPress={() => router.push({ pathname: "/promoter/leads-list", params: { status: "new" } } as never)} />
            </View>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <KpiTile icon="checkmark-done" label="Converted" value={converted} tint={colors.successSoft} accent={colors.success} onPress={() => router.push({ pathname: "/promoter/leads-list", params: { status: "converted" } } as never)} />
              <KpiTile icon="person" label="Active buyers" value={activeBuyers} tint="#E8F1FE" accent="#2B6FE1" onPress={() => router.push("/promoter/leads-list" as Href)} />
              <KpiTile icon="calendar" label="Site visits" value={data.visits.length} tint="#F2EBFB" accent="#7C4BC9" onPress={() => router.push("/manage-visits" as Href)} />
            </View>
          </View>
        </PromoterSection>

        {/* quick actions */}
        <PromoterSection title="Quick actions">
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.sm }}>
            {shortcuts.map((s) => (
              <ShortcutTile key={s.label} icon={s.icon} label={s.label} tint={s.tint} accent={s.accent} onPress={() => router.push(s.to)} />
            ))}
          </View>
        </PromoterSection>

        {/* assigned projects */}
        <PromoterSection title="Assigned projects" actionLabel={data.assigned.length ? "See all" : undefined} onAction={() => router.navigate("/(tabs)/properties" as Href)}>
          {data.assigned.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}>
              {data.assigned.map((p) => (
                <VerifiedListingCard key={p.id} property={p} width={210} saved={favorites.has(p.id)} onSave={() => favorites.toggle(p.id)} onPress={() => router.push(`/property/${p.id}` as Href)} />
              ))}
            </ScrollView>
          ) : (
            <SoftEmpty icon="business-outline" text="No projects assigned yet. Admin-assigned projects will appear here." />
          )}
        </PromoterSection>

        {/* saved projects — same wishlist as Account → My Wishlist, so it
            carries the same name (bug 28-07: no duplicate-looking features) */}
        <PromoterSection title="My Wishlist" actionLabel={data.saved.length ? "See all" : undefined} onAction={() => router.push("/saved" as Href)}>
          {data.saved.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.md }}>
              {data.saved.map((p) => (
                <VerifiedListingCard key={p.id} property={p} width={210} saved={favorites.has(p.id)} onSave={() => favorites.toggle(p.id)} onPress={() => router.push(`/property/${p.id}` as Href)} />
              ))}
            </ScrollView>
          ) : (
            <SoftEmpty icon="bookmark-outline" text="Save projects you love to keep them handy for sharing." />
          )}
        </PromoterSection>

        {/* referral sharing — Build Your Team + Promote Your Project (28-07) */}
        <View style={{ marginBottom: space.md }}>
          <ReferralSharing />
        </View>

        {/* recent leads */}
        <PromoterSection title="Recent leads">
          {leads.length ? (
            leads.slice(0, 6).map((l: any) => (
              <Card key={l.id} style={{ marginBottom: space.xs, flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person" size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: colors.ink, fontSize: T.small.fontSize + 1 }}>
                    {(l.source ?? "Lead").replace(/_/g, " ")}
                  </Text>
                  <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>{timeAgo(l.created_at)}</Text>
                </View>
                <View style={{ backgroundColor: colors.surfaceSunken, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
                  <Text style={{ color: colors.inkSoft, fontSize: T.caption.fontSize + 1, fontWeight: "600" }}>{l.status}</Text>
                </View>
              </Card>
            ))
          ) : (
            <SoftEmpty icon="people-outline" text="No leads yet. Share your referral card to start receiving enquiries." />
          )}
        </PromoterSection>

        {/* recent activity */}
        <PromoterSection title="Recent activity">
          {data.activity.length ? (
            <Card style={{ padding: 0 }}>
              {data.activity.slice(0, 8).map((a: any, i: number) => (
                <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.sm + 2, borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.border }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand }} />
                  <Text style={{ flex: 1, color: colors.inkSoft, fontSize: T.small.fontSize }} numberOfLines={1}>
                    {(a.event_type ?? "activity").replace(/_/g, " ")}
                  </Text>
                  <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>{timeAgo(a.created_at)}</Text>
                </View>
              ))}
            </Card>
          ) : (
            <SoftEmpty icon="pulse-outline" text="Your recent actions and updates will show up here." />
          )}
        </PromoterSection>

        {/* roadmap — reserved space for upcoming promoter modules incl. ML tree */}
        <PromoterSection title="Coming to your suite">
          <View style={{ gap: space.sm }}>
            <ReservedCard icon="document-text" title="Downloadable statements" subtitle="Monthly PDF statements & incentive programs." />
          </View>
        </PromoterSection>
      </ScrollView>
      <JamindarFab />
    </SafeAreaView>
  );
}
