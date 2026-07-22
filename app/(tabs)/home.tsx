import { Text, View, Pressable, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, SectionTitle } from "@/components/ui";
import { Brandmark } from "@/components/Brand";
import { RolePreviewBar } from "@/components/RolePreview";
import { supabase } from "@/lib/supabase";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { colors, tileAccents, type TileAccent } from "@/lib/theme";
import { formatINR, formatArea, initials } from "@/lib/format";
import { ROLE_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

type Tile = { label: string; icon: string; accent: TileAccent; href: Href };

const TILES_BY_ROLE: Record<string, Tile[]> = {
  buyer: [
    { label: "Properties", icon: "business", accent: "green", href: "/(tabs)/properties" },
    { label: "Preferences", icon: "options", accent: "indigo", href: "/buyer/onboarding" },
    { label: "Jamindar", icon: "sparkles", accent: "red", href: "/(tabs)/assistant" },
    { label: "Account", icon: "person", accent: "violet", href: "/(tabs)/account" },
  ],
  promoter: [
    { label: "My Dashboard", icon: "briefcase", accent: "blue", href: "/promoter" },
    { label: "Properties", icon: "business", accent: "green", href: "/(tabs)/properties" },
    { label: "Jamindar", icon: "sparkles", accent: "red", href: "/(tabs)/assistant" },
    { label: "Account", icon: "person", accent: "violet", href: "/(tabs)/account" },
  ],
  super_admin: [
    { label: "Admin Console", icon: "shield-checkmark", accent: "amber", href: "/admin" },
    { label: "Properties", icon: "business", accent: "green", href: "/(tabs)/properties" },
    { label: "Jamindar", icon: "sparkles", accent: "red", href: "/(tabs)/assistant" },
    { label: "Account", icon: "person", accent: "violet", href: "/(tabs)/account" },
  ],
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
  const tiles = TILES_BY_ROLE[role] ?? TILES_BY_ROLE.buyer;
  const { data: featured } = useFeatured();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Brandmark size={42} />
          <View style={{ flex: 1 }}>
            <Text style={{ letterSpacing: 2, color: colors.inkFaint, fontSize: 11, fontWeight: "700" }}>
              NAMASTE 🙏
            </Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}>
              Welcome Back, {profile?.full_name?.split(" ")[0] ?? "Guest"}
            </Text>
          </View>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>{initials(profile?.full_name)}</Text>
          </View>
        </View>

        {/* role badge */}
        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor: colors.brandSoft,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 12 }}>
              {ROLE_LABELS[role]}
            </Text>
          </View>
        </View>

        {/* super-admin role preview switcher */}
        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <RolePreviewBar />
        </View>

        {/* module tiles */}
        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 }}>
            {tiles.map((t) => (
              <Pressable
                key={t.label}
                onPress={() => router.push(t.href)}
                style={{ width: "48%" }}
              >
                <Card style={{ alignItems: "flex-start", paddingVertical: 18 }}>
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      backgroundColor: tileAccents[t.accent].bg,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                    }}
                  >
                    <Ionicons name={t.icon as any} size={24} color={tileAccents[t.accent].fg} />
                  </View>
                  <Text style={{ fontWeight: "700", fontSize: 15, color: colors.ink }}>{t.label}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        </View>

        {/* featured */}
        <View style={{ paddingHorizontal: 20, marginTop: 26 }}>
          <SectionTitle>Featured Properties</SectionTitle>
        </View>
        {featured && featured.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
          >
            {featured.map((p) => (
              <Pressable key={p.id} onPress={() => router.push(`/property/${p.id}`)} style={{ width: 250 }}>
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <View style={{ height: 130, backgroundColor: colors.surfaceSunken }}>
                    {p.images?.[0] ? (
                      <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="image" size={32} color={colors.inkFaint} />
                      </View>
                    )}
                  </View>
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontWeight: "700", color: colors.ink }} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {[p.locality, p.city].filter(Boolean).join(", ") || PROPERTY_TYPE_LABELS[p.property_type]}
                    </Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                      <Text style={{ color: colors.brand, fontWeight: "800" }}>{formatINR(p.price)}</Text>
                      <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
                        {formatArea(p.area_value, p.area_unit)}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <Text style={{ color: colors.inkFaint, textAlign: "center" }}>
                No properties published yet.
                {role === "super_admin" ? " Add your first from the Admin Console." : ""}
              </Text>
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
