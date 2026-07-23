import { Text, View, Pressable, ScrollView, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui";
import { IconChip } from "@/components/premium";
import {
  GreetingHeader,
  SearchRow,
  LandHero,
  QuickActionTile,
  LandTypeTile,
  VerifiedListingCard,
  RowHeader,
  LAND_TYPES,
  PROJECT_PHASES,
} from "@/components/land";
import { RolePreviewBar } from "@/components/RolePreview";
import { LanguageGate } from "@/components/LanguageGate";
import { supabase } from "@/lib/supabase";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { initials } from "@/lib/format";
import { type Property, type PropertyType, type ProjectPhase } from "@/lib/types";
import { computeSuggestions, checklistText, type Suggestion } from "@/lib/suggestions";
import { encodeFilters, type SearchFilters } from "@/lib/property-search";
import { useCompare } from "@/lib/compare";

type RoleAction = { label: string; sub: string; icon: string; accent: { bg: string; fg: string }; href: Href };

const ROLE_ACTION: Record<string, RoleAction> = {
  buyer: { label: "My Preferences", sub: "Tune what you want", icon: "options", accent: { bg: "#ECEEFB", fg: "#4B57C9" }, href: "/buyer/onboarding" },
  promoter: { label: "My Dashboard", sub: "vCard, leads & visits", icon: "briefcase", accent: { bg: "#E8F1FE", fg: "#2B6FE1" }, href: "/promoter" },
  super_admin: { label: "Admin Console", sub: "Manage the ecosystem", icon: "shield-checkmark", accent: { bg: colors.goldSoft, fg: colors.goldDark }, href: "/admin" },
};

function useFeatured() {
  return useQuery({
    queryKey: ["featured-properties"],
    queryFn: async (): Promise<Property[]> => {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .in("status", ["available", "reserved"])
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6);
      return (data as Property[]) ?? [];
    },
  });
}

export default function Home() {
  const router = useRouter();
  const { profile } = useAuth();
  const role = useEffectiveRole();
  const { data: featured } = useFeatured();
  const compare = useCompare();
  const { data: suggestions } = useQuery({
    queryKey: ["suggestions", profile?.id, role],
    enabled: !!profile?.id && role === "buyer",
    queryFn: () => computeSuggestions(profile!.id),
  });

  const firstName = profile?.full_name?.split(" ")[0] ?? "Guest";
  const roleAction = ROLE_ACTION[role] ?? ROLE_ACTION.buyer;

  function browse(filters?: SearchFilters) {
    router.push(
      filters
        ? { pathname: "/(tabs)/properties", params: { filters: encodeFilters(filters) } }
        : "/(tabs)/properties"
    );
  }

  function openPhase(phase: ProjectPhase) {
    browse({ phase });
  }
  function openType(type: PropertyType) {
    browse({ types: [type] });
  }
  function openMap(p: Property) {
    if (p.gmaps_url) Linking.openURL(p.gmaps_url).catch(() => router.push(`/property/${p.id}`));
    else router.push(`/property/${p.id}`);
  }

  function runSuggestion(s: Suggestion) {
    if (s.action.type === "checklist") Alert.alert("Pre-purchase checklist", checklistText());
    else if (s.action.type === "visits") router.push("/(tabs)/account");
    else browse(s.action.filters);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* header */}
        <View style={{ paddingHorizontal: 20, paddingTop: space.xs }}>
          <GreetingHeader
            name={firstName}
            initials={initials(profile?.full_name)}
            avatarUrl={profile?.avatar_url}
            onBell={() => router.push("/notifications" as Href)}
            hasAlert={!!(suggestions && suggestions.length > 0)}
          />
        </View>

        {/* search */}
        <View style={{ paddingHorizontal: 20, marginTop: space.sm }}>
          <SearchRow onPress={() => browse()} onFilter={() => browse()} />
        </View>

        {/* hero — Ask Jamindar (AI advisor) */}
        <View style={{ paddingHorizontal: 20, marginTop: space.sm }}>
          <LandHero onPress={() => router.push("/(tabs)/assistant")} />
        </View>

        {/* super-admin role preview switcher */}
        {profile?.role === "super_admin" ? (
          <View style={{ paddingHorizontal: 20, marginTop: space.sm }}>
            <RolePreviewBar />
          </View>
        ) : null}

        {/* role access + Jamindar */}
        <View style={{ paddingHorizontal: 20, marginTop: space.md, flexDirection: "row", gap: 12 }}>
          <AccessCard
            label={roleAction.label}
            sub={roleAction.sub}
            icon={roleAction.icon}
            bg={roleAction.accent.bg}
            fg={roleAction.accent.fg}
            onPress={() => router.push(roleAction.href)}
          />
          <AccessCard
            label="Ask Jamindar"
            sub="Your AI advisor"
            icon="sparkles"
            bg={colors.brandSoft}
            fg={colors.brand}
            onPress={() => router.push("/(tabs)/assistant")}
          />
        </View>

        {/* projects by phase */}
        <View style={{ paddingHorizontal: 20, marginTop: space.md }}>
          <RowHeader title="Projects" onAction={() => browse()} actionLabel="View all" />
          <View style={{ flexDirection: "row", gap: 11, marginTop: space.sm }}>
            {PROJECT_PHASES.map((p) => (
              <QuickActionTile key={p.phase} emoji={p.emoji} label={p.label} tint={p.tint} onPress={() => openPhase(p.phase)} />
            ))}
          </View>
        </View>

        {/* types of lands */}
        <View style={{ marginTop: space.md }}>
          <View style={{ paddingHorizontal: 20 }}>
            <RowHeader title="Types of Lands" onAction={() => browse()} actionLabel="See all" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, marginTop: space.sm }}>
            {LAND_TYPES.map((lt) => (
              <LandTypeTile key={lt.label} emoji={lt.emoji} label={lt.label} onPress={() => openType(lt.type)} />
            ))}
          </ScrollView>
        </View>

        {/* verified listings */}
        <View style={{ marginTop: space.md }}>
          <View style={{ paddingHorizontal: 20 }}>
            <RowHeader title="Verified Listings" onAction={() => browse()} />
          </View>
          {featured && featured.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14, marginTop: space.sm }}>
              {featured.map((p) => (
                <VerifiedListingCard
                  key={p.id}
                  property={p}
                  saved={compare.has(p.id)}
                  onSave={() => compare.toggle(p.id)}
                  onMap={() => openMap(p)}
                  onPress={() => router.push(`/property/${p.id}`)}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: 20, marginTop: space.sm }}>
              <Card>
                <Text style={{ color: colors.inkFaint, textAlign: "center" }}>
                  No properties published yet.
                  {role === "super_admin" ? " Add your first from the Admin Console." : ""}
                </Text>
              </Card>
            </View>
          )}
        </View>

        {/* for you — buyers */}
        {role === "buyer" && suggestions && suggestions.length > 0 ? (
          <View style={{ paddingHorizontal: 20, marginTop: space.lg }}>
            <RowHeader title="For You" />
            <View style={{ gap: 10, marginTop: space.sm }}>
              {suggestions.slice(0, 4).map((s) => {
                const tone = s.tone === "gold" ? colors.gold : s.tone === "green" ? colors.success : s.tone === "blue" ? "#2B6FE1" : colors.brand;
                return (
                  <Card key={s.key} onPress={() => runSuggestion(s)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={s.icon as any} size={20} color={tone} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 14 }} numberOfLines={1}>{s.title}</Text>
                      <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>{s.subtitle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                  </Card>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* tools & guides */}
        <View style={{ paddingHorizontal: 20, marginTop: space.lg }}>
          <RowHeader title="Tools & Guides" />
          <View style={{ flexDirection: "row", gap: 12, marginTop: space.sm }}>
            <QuickTool icon="calculator" label="Calculators" onPress={() => router.push("/tools/calculators")} />
            <QuickTool icon="document-text" label="Legal Guide" onPress={() => router.push("/tools/legal")} />
            <QuickTool icon="mic" label="Voice Setup" onPress={() => router.push("/jamindar/settings")} />
          </View>
        </View>
      </ScrollView>
      <LanguageGate />
    </SafeAreaView>
  );
}

function AccessCard({ label, sub, icon, bg, fg, onPress }: { label: string; sub: string; icon: string; bg: string; fg: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 14 }}>
      <IconChip icon={icon} bg={bg} fg={fg} size={40} />
      <Text style={{ fontWeight: "800", fontSize: T.small.fontSize + 1, color: colors.ink, marginTop: 10 }}>{label}</Text>
      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
    </Card>
  );
}

function QuickTool({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <Card style={{ alignItems: "center", paddingVertical: 16 }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
          <Ionicons name={icon as any} size={20} color={colors.brand} />
        </View>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink }} numberOfLines={1}>{label}</Text>
      </Card>
    </Pressable>
  );
}
