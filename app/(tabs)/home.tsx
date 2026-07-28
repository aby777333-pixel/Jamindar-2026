import { useEffect, useRef, useState } from "react";
import { Text, View, Pressable, ScrollView, Alert, Linking, AppState, Image, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { LanguageGate } from "@/components/LanguageGate";
import { supabase } from "@/lib/supabase";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { initials, greetingFor, formatINR } from "@/lib/format";
import { type Property, type PropertyType, type ProjectPhase } from "@/lib/types";
import { computeSuggestions, checklistText, type Suggestion } from "@/lib/suggestions";
import { encodeFilters, type SearchFilters } from "@/lib/property-search";
import { useFavorites } from "@/lib/favorites";

type RoleAction = { label: string; sub: string; icon: string; accent: { bg: string; fg: string }; href: Href };

const ROLE_ACTION: Record<string, RoleAction> = {
  buyer: { label: "My Preferences", sub: "Tune what you want", icon: "options", accent: { bg: "#ECEEFB", fg: "#4B57C9" }, href: "/buyer/onboarding" },
  promoter: { label: "My Dashboard", sub: "vCard, leads & visits", icon: "briefcase", accent: { bg: "#E8F1FE", fg: "#2B6FE1" }, href: "/promoter" },
  super_admin: { label: "Admin Console", sub: "Manage the ecosystem", icon: "shield-checkmark", accent: { bg: colors.goldSoft, fg: colors.goldDark }, href: "/admin" },
};

/** Time-of-day greeting that stays correct while the app is open: recomputes
 *  every minute and whenever the app returns to the foreground, instead of
 *  freezing at whatever the clock said when the screen first rendered. */
function useGreeting(): string {
  const [greeting, setGreeting] = useState(() => greetingFor());
  useEffect(() => {
    const update = () => setGreeting(greetingFor());
    const id = setInterval(update, 60_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") update();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  return greeting;
}

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
  // Bug fix 28-07: the card heart was wired to the COMPARE store, so "saved"
  // properties never reached the wishlist. It now uses the shared favorites hook.
  const favorites = useFavorites();
  const { data: suggestions } = useQuery({
    queryKey: ["suggestions", profile?.id, role],
    enabled: !!profile?.id && role === "buyer",
    queryFn: () => computeSuggestions(profile!.id),
  });

  const firstName = profile?.full_name?.split(" ")[0] ?? "Guest";
  const greeting = useGreeting();
  const roleAction = ROLE_ACTION[role] ?? ROLE_ACTION.buyer;

  function browse(filters?: SearchFilters) {
    router.navigate(
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
    else if (s.action.type === "visits") router.navigate("/(tabs)/account");
    else browse(s.action.filters);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* header */}
        <View style={{ paddingHorizontal: 20, paddingTop: space.xs }}>
          <GreetingHeader
            name={firstName}
            greeting={greeting}
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

        {/* hero slider — live projects (report 28-07): auto-plays, swipeable */}
        {featured && featured.length > 0 ? (
          <View style={{ paddingHorizontal: 20, marginTop: space.sm }}>
            <HeroSlider items={featured.slice(0, 5)} onOpen={(p) => router.push(`/property/${p.id}`)} />
          </View>
        ) : null}

        {/* hero — Ask Jamindar (AI advisor) */}
        <View style={{ paddingHorizontal: 20, marginTop: space.sm }}>
          <LandHero onPress={() => router.navigate("/(tabs)/assistant")} />
        </View>

        {/* Role preview lives in the Admin console now — it is a testing tool
            and does not belong on a live user-facing screen. */}

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
            onPress={() => router.navigate("/(tabs)/assistant")}
          />
        </View>

        {/* projects by phase */}
        <View style={{ paddingHorizontal: 20, marginTop: space.md }}>
          <RowHeader title="Projects" onAction={() => router.push("/projects" as Href)} actionLabel="View all" />
          <View style={{ flexDirection: "row", gap: 11, marginTop: space.sm }}>
            {PROJECT_PHASES.map((p) => (
              <QuickActionTile key={p.phase} emoji={p.emoji} label={p.label} tint={p.tint} onPress={() => openPhase(p.phase)} />
            ))}
          </View>
        </View>

        {/* types of lands */}
        <View style={{ marginTop: space.md }}>
          <View style={{ paddingHorizontal: 20 }}>
            <RowHeader title="Types of Lands" onAction={() => router.push("/land-types" as Href)} actionLabel="See all" />
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
            <RowHeader title="Verified Listings" onAction={() => browse({ featured: true })} />
          </View>
          {featured && featured.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14, marginTop: space.sm }}>
              {featured.map((p) => (
                <VerifiedListingCard
                  key={p.id}
                  property={p}
                  saved={favorites.has(p.id)}
                  onSave={() => favorites.toggle(p.id)}
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

/** Auto-playing, swipeable hero slider over the live projects (report 28-07).
 *  Each slide: project image, name, price and a View Details CTA. */
function HeroSlider({ items, onOpen }: { items: Property[]; onOpen: (p: Property) => void }) {
  const { width: winW } = useWindowDimensions();
  const W = winW - 40; // matches the screen's 20px side padding
  const H = 178;
  const scrollRef = useRef<ScrollView>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);

  // auto-play (pauses naturally while the user drags — the interval just
  // scrolls to the slide after the one last seen)
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => {
      const next = (idxRef.current + 1) % items.length;
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
      idxRef.current = next;
      setIdx(next);
    }, 4200);
    return () => clearInterval(id);
  }, [items.length, W]);

  if (items.length === 0) return null;

  return (
    <View style={{ borderRadius: 18, overflow: "hidden" }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / W);
          idxRef.current = i;
          setIdx(i);
        }}
      >
        {items.map((p) => (
          <Pressable key={p.id} onPress={() => onOpen(p)} style={{ width: W, height: H, backgroundColor: colors.navy }}>
            {p.images?.[0] ? (
              <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : null}
            <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 110 }} />
            <View style={{ position: "absolute", left: 14, right: 14, bottom: 12, flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }} numberOfLines={1}>{p.title}</Text>
                <Text style={{ color: colors.goldLight, fontWeight: "800", fontSize: 13.5, marginTop: 2 }}>
                  {p.price ? formatINR(p.price) : "Price on request"}
                </Text>
              </View>
              <View style={{ backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>View Details</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {items.length > 1 ? (
        <View style={{ position: "absolute", top: 10, right: 12, flexDirection: "row", gap: 5 }}>
          {items.map((_, i) => (
            <View key={i} style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === idx ? "#fff" : "rgba(255,255,255,0.55)" }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
