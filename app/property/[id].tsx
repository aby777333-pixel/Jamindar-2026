import { useState, useEffect } from "react";
import { Text, View, ScrollView, Image, Pressable, Alert, Share, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { createAudioPlayer } from "expo-audio";
import { Card, Loading, Button } from "@/components/ui";
import { topApproval } from "@/components/land";
import { JamindarFab } from "@/components/Jamindar";
import { synthesizeSpeech, translate, loadMemory } from "@/lib/jamindar";
import { supabase } from "@/lib/supabase";
import { useAuth, useEffectiveRole } from "@/lib/store";
import { useCompare } from "@/lib/compare";
import { encodeFilters } from "@/lib/property-search";
import { colors } from "@/lib/theme";
import { formatINR, formatArea } from "@/lib/format";
import { PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const role = useEffectiveRole();
  const qc = useQueryClient();
  const [imgIndex, setImgIndex] = useState(0);
  const compare = useCompare();
  const [lang, setLang] = useState("en-IN");
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);

  useEffect(() => {
    if (profile?.id) loadMemory(profile.id).then((m) => m?.language && setLang(m.language));
  }, [profile?.id]);

  async function speakText(text: string) {
    if (!text) return;
    setVoiceBusy(true);
    try {
      const chunks = await synthesizeSpeech(text.slice(0, 1400), lang);
      for (const b64 of chunks) {
        const player = createAudioPlayer({ uri: `data:audio/wav;base64,${b64}` });
        player.play();
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch {
      /* voice optional */
    } finally {
      setVoiceBusy(false);
    }
  }

  async function onTranslate(description: string) {
    if (translated) {
      setTranslated(null);
      return;
    }
    setVoiceBusy(true);
    try {
      const out = await translate(description, lang);
      setTranslated(out);
      setShowOriginal(false);
    } catch {
      Alert.alert("Translate", "Couldn't translate right now. Please try again.");
    } finally {
      setVoiceBusy(false);
    }
  }

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async (): Promise<Property | null> => {
      const { data } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
      return (data as Property) ?? null;
    },
  });

  // Similar properties: same type, different property, published.
  const { data: similar } = useQuery({
    queryKey: ["similar", id, property?.property_type],
    enabled: !!property,
    queryFn: async (): Promise<Property[]> => {
      const { data } = await supabase
        .from("properties")
        .select("*")
        .eq("property_type", property!.property_type)
        .neq("id", id)
        .in("status", ["available", "reserved", "sold"])
        .limit(6);
      return (data as Property[]) ?? [];
    },
  });

  const { data: isFav } = useQuery({
    queryKey: ["favorite", id, profile?.id],
    enabled: !!profile?.id && !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("buyer_id", profile!.id)
        .eq("property_id", id)
        .maybeSingle();
      return !!data;
    },
  });

  async function toggleFav() {
    if (!profile) return;
    if (isFav) {
      await supabase.from("favorites").delete().eq("buyer_id", profile.id).eq("property_id", id);
    } else {
      await supabase.from("favorites").insert({ buyer_id: profile.id, property_id: id });
    }
    qc.invalidateQueries({ queryKey: ["favorite", id, profile.id] });
  }

  async function onShare() {
    if (!property) return;
    await Share.share({
      message: `${property.title} — ${formatINR(property.price)}\n${[property.locality, property.city].filter(Boolean).join(", ")}\nvia Jamin Properties`,
    });
  }

  async function onBrochure() {
    if (!property?.brochure_url) {
      Alert.alert("Brochure", "No brochure uploaded for this property yet.");
      return;
    }
    if (profile) await supabase.from("brochure_downloads").insert({ property_id: id, user_id: profile.id });
    await WebBrowser.openBrowserAsync(property.brochure_url);
  }

  async function onSiteVisit() {
    if (!profile) return;
    await supabase.from("site_visits").insert({
      property_id: id,
      buyer_id: profile.id,
      promoter_id: property?.promoter_id ?? null,
      status: "requested",
    });
    Alert.alert("Site visit requested", "Our team will contact you to confirm a convenient time.");
  }

  async function onCallback() {
    if (!profile) return;
    await supabase.from("leads").insert({
      buyer_id: profile.id,
      promoter_id: property?.promoter_id ?? null,
      property_id: id,
      source: "callback_request",
      status: "new",
    });
    Alert.alert("Callback requested", "A Jamin advisor will call you shortly. Namaste 🙏");
  }

  function onMap() {
    if (property?.gmaps_url) return Linking.openURL(property.gmaps_url);
    if (property?.lat && property?.lng)
      return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${property.lat},${property.lng}`);
    Alert.alert("Location", "Map location not available for this property.");
  }

  if (isLoading) return <Loading />;
  if (!property)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.inkFaint }}>Property not found.</Text>
        </View>
      </SafeAreaView>
    );

  const images = property.images ?? [];
  const approvalTag = topApproval(property.approvals);
  const PHASE_META: Record<string, { label: string; color: string }> = {
    ongoing: { label: "Ongoing", color: colors.goldDark },
    current: { label: "Ready now", color: colors.brand },
    future: { label: "Upcoming", color: colors.success },
  };
  const phase = PHASE_META[property.project_phase] ?? PHASE_META.current;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* gallery */}
        <View style={{ height: 240, backgroundColor: colors.surfaceSunken }}>
          {images[imgIndex] ? (
            <Image source={{ uri: images[imgIndex] }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="image" size={48} color={colors.inkFaint} />
            </View>
          )}
          {/* glossy legibility gradients (top + bottom) */}
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: 90 }}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.28)"]}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 70 }}
            pointerEvents="none"
          />
          <Pressable
            onPress={() => router.back()}
            style={{ position: "absolute", top: 12, left: 12, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          {role === "buyer" ? (
            <Pressable
              onPress={toggleFav}
              style={{ position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8 }}
            >
              <Ionicons name={isFav ? "heart" : "heart-outline"} size={22} color={isFav ? colors.brand : "#fff"} />
            </Pressable>
          ) : null}
          {/* verified + phase badges */}
          <View style={{ position: "absolute", bottom: 12, left: 12, flexDirection: "row", gap: 6 }}>
            {approvalTag ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }}>
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text style={{ color: colors.success, fontSize: 11, fontWeight: "800" }}>{approvalTag}</Text>
              </View>
            ) : null}
            <View style={{ backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }}>
              <Text style={{ color: phase.color, fontSize: 11, fontWeight: "800" }}>{phase.label}</Text>
            </View>
          </View>
          {property.virtual_tour_url ? (
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(property.virtual_tour_url!)}
              style={{ position: "absolute", bottom: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }}
            >
              <Ionicons name="cube" size={12} color={colors.ink} />
              <Text style={{ color: colors.ink, fontSize: 11, fontWeight: "800" }}>360° Tour</Text>
            </Pressable>
          ) : null}
          {images.length > 1 ? (
            <View style={{ position: "absolute", bottom: 44, alignSelf: "center", flexDirection: "row", gap: 6 }}>
              {images.map((_, i) => (
                <Pressable
                  key={i}
                  onPress={() => setImgIndex(i)}
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === imgIndex ? "#fff" : "rgba(255,255,255,0.5)" }}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>{property.title}</Text>
          <Text style={{ color: colors.inkFaint, marginTop: 4 }}>
            {[property.locality, property.city, property.district, property.state].filter(Boolean).join(", ")}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
            <Card style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 12 }}>
              <Text style={{ color: colors.inkFaint, fontSize: 11 }}>Price</Text>
              <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 16 }}>{formatINR(property.price)}</Text>
            </Card>
            <Card style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 12 }}>
              <Text style={{ color: colors.inkFaint, fontSize: 11 }}>Area</Text>
              <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}>
                {formatArea(property.area_value, property.area_unit)}
              </Text>
            </Card>
            <Card style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: colors.goldSoft, borderColor: colors.goldSoft }}>
              <Text style={{ color: colors.goldDark, fontSize: 11 }}>
                {property.plots_available != null ? "Plots left" : "Status"}
              </Text>
              <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}>
                {property.plots_available != null ? `${property.plots_available}/${property.plots_total}` : phase.label}
              </Text>
            </Card>
          </View>

          {/* meta chips */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <MetaChip icon="pricetag" label={PROPERTY_TYPE_LABELS[property.property_type]} />
            {property.vastu_facing ? <MetaChip icon="compass" label={`${property.vastu_facing} facing`} /> : null}
            {property.plots_available != null ? (
              <MetaChip icon="grid" label={`${property.plots_available}/${property.plots_total} plots`} />
            ) : null}
            {Object.entries(property.approvals ?? {})
              .filter(([, v]) => v)
              .map(([k]) => (
                <MetaChip key={k} icon="checkmark-circle" label={k.toUpperCase()} />
              ))}
          </View>

          {property.description ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 8 }}>
                <Text style={{ fontWeight: "800", fontSize: 16, color: colors.ink }}>About this property</Text>
                <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                  {voiceBusy ? <ActivityIndicator color={colors.brand} /> : null}
                  <Pressable
                    onPress={() => speakText(translated && !showOriginal ? translated : property.description!)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <Ionicons name="volume-high" size={18} color={colors.brand} />
                    <Text style={{ color: colors.brand, fontWeight: "600", fontSize: 13 }}>Listen</Text>
                  </Pressable>
                  <Pressable onPress={() => onTranslate(property.description!)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="language" size={18} color={colors.brand} />
                    <Text style={{ color: colors.brand, fontWeight: "600", fontSize: 13 }}>{translated ? "Original" : "Translate"}</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={{ color: colors.inkSoft, lineHeight: 22 }}>
                {translated && !showOriginal ? translated : property.description}
              </Text>
              {translated ? (
                <Pressable onPress={() => setShowOriginal((v) => !v)} style={{ marginTop: 6 }}>
                  <Text style={{ color: colors.brand, fontSize: 12, fontWeight: "600" }}>
                    {showOriginal ? "Show translation" : "Show original"}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {property.amenities?.length ? (
            <>
              <Text style={{ fontWeight: "800", fontSize: 16, color: colors.ink, marginTop: 22, marginBottom: 8 }}>
                Amenities
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {property.amenities.map((a) => (
                  <View key={a} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}>
                    <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{a}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* actions grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginTop: 24 }}>
            <ActionButton icon="document-text" label="Brochure" onPress={onBrochure} />
            <ActionButton icon="location" label="Map" onPress={onMap} />
            <ActionButton icon="share-social" label="Share" onPress={onShare} />
            <ActionButton icon="call" label="Callback" onPress={onCallback} />
          </View>

          <Button label="Schedule Site Visit" onPress={onSiteVisit} style={{ marginTop: 16 }} />

          {/* compare + alternatives */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => {
                if (!compare.has(id) && compare.atLimit()) {
                  Alert.alert("Compare", "You can compare up to 3 properties. Remove one first.");
                  return;
                }
                compare.toggle(id);
              }}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: compare.has(id) ? colors.brandSoft : colors.surface }}
            >
              <Ionicons name={compare.has(id) ? "checkmark-circle" : "git-compare"} size={18} color={colors.brand} />
              <Text style={{ color: colors.brand, fontWeight: "700" }}>{compare.has(id) ? "In Compare" : "Add to Compare"}</Text>
            </Pressable>
            {compare.ids.length > 0 ? (
              <Pressable
                onPress={() => router.push("/tools/compare")}
                style={{ paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.brand }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>View ({compare.ids.length})</Text>
              </Pressable>
            ) : null}
          </View>

          {/* cheaper / premium alternatives */}
          {property.price ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/(tabs)/properties", params: { filters: encodeFilters({ types: [property.property_type], budgetMax: property.price! }) } })
                }
                style={altChip}
              >
                <Ionicons name="trending-down" size={16} color={colors.success} />
                <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 13 }}>Cheaper options</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/(tabs)/properties", params: { filters: encodeFilters({ types: [property.property_type], budgetMin: property.price! }) } })
                }
                style={altChip}
              >
                <Ionicons name="trending-up" size={16} color={colors.brand} />
                <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 13 }}>Premium options</Text>
              </Pressable>
            </View>
          ) : null}

          {/* similar properties */}
          {similar && similar.length > 0 ? (
            <>
              <Text style={{ fontWeight: "800", fontSize: 16, color: colors.ink, marginTop: 24, marginBottom: 10 }}>
                Similar Properties
              </Text>
              {similar.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/property/${p.id}`)}>
                  <Card style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {p.images?.[0] ? (
                        <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} />
                      ) : (
                        <Ionicons name="business" size={20} color={colors.inkFaint} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: colors.ink }} numberOfLines={1}>{p.title}</Text>
                      <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>{[p.locality, p.city].filter(Boolean).join(", ")}</Text>
                    </View>
                    <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 13 }}>{formatINR(p.price)}</Text>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
      <JamindarFab />
    </SafeAreaView>
  );
}

const altChip = {
  flex: 1,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: 6,
  paddingVertical: 12,
  borderRadius: 12,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
};

function MetaChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
      <Ionicons name={icon as any} size={13} color={colors.brand} />
      <Text style={{ color: colors.brand, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function ActionButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: "22%", alignItems: "center" }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon as any} size={22} color={colors.brand} />
      </View>
      <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 6 }}>{label}</Text>
    </Pressable>
  );
}
