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
import { logActivity } from "@/lib/audit";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR, formatArea } from "@/lib/format";
import { PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

type TabKey =
  | "overview" | "photos" | "videos" | "master_plan"
  | "amenities" | "location" | "legal" | "investment";

const TAB_META: Record<TabKey, { label: string; icon: string }> = {
  overview: { label: "Overview", icon: "reader-outline" },
  photos: { label: "Photos", icon: "images-outline" },
  videos: { label: "Videos", icon: "videocam-outline" },
  master_plan: { label: "Master Plan", icon: "map-outline" },
  amenities: { label: "Amenities", icon: "sparkles-outline" },
  location: { label: "Location", icon: "location-outline" },
  legal: { label: "Legal", icon: "shield-checkmark-outline" },
  investment: { label: "Investment", icon: "trending-up-outline" },
};

function openUrl(url?: string | null) {
  if (!url) return;
  Linking.openURL(url).catch(() => WebBrowser.openBrowserAsync(url).catch(() => {}));
}

export default function PropertyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const role = useEffectiveRole();
  const qc = useQueryClient();
  const [imgIndex, setImgIndex] = useState(0);
  const [tab, setTab] = useState<TabKey>("overview");
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

  useEffect(() => {
    if (property?.id) logActivity("property_viewed", { property_id: property.id });
  }, [property?.id]);

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
      logActivity("property_saved", { property_id: id });
    }
    qc.invalidateQueries({ queryKey: ["favorite", id, profile.id] });
  }

  async function onShare() {
    if (!property) return;
    logActivity("property_shared", { property_id: property.id });
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
    logActivity("site_visit_requested", { property_id: id });
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
    logActivity("callback_requested", { property_id: id });
    Alert.alert("Callback requested", "A Jamin advisor will call you shortly. Namaste 🙏");
  }

  function onMap() {
    if (property?.gmaps_url) return openUrl(property.gmaps_url);
    if (property?.lat && property?.lng)
      return openUrl(`https://www.google.com/maps/search/?api=1&query=${property.lat},${property.lng}`);
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

  // ── which tabs to show (data-driven, honouring admin tab_config) ──
  const has: Record<TabKey, boolean> = {
    overview: true,
    photos: images.length > 0,
    videos: (property.videos?.length ?? 0) > 0 || (property.drone_videos?.length ?? 0) > 0,
    master_plan: !!property.master_plan_url || (property.plot_layout?.length ?? 0) > 0,
    amenities: (property.amenities?.length ?? 0) > 0,
    location: !!(property.gmaps_url || (property.lat && property.lng) || property.street_view_url || property.google_earth_url || (property.nearby_places?.length ?? 0) > 0 || (property.nearby_landmarks?.length ?? 0) > 0),
    legal: !!property.rera_number || Object.values(property.approvals ?? {}).some(Boolean) || Object.keys(property.legal ?? {}).length > 0 || (property.documents?.length ?? 0) > 0,
    investment: Object.keys(property.investment ?? {}).length > 0,
  };
  const hidden = new Set(property.tab_config?.hidden ?? []);
  const order = property.tab_config?.order ?? [];
  let tabs = (Object.keys(TAB_META) as TabKey[]).filter((k) => has[k] && !hidden.has(k));
  if (order.length) {
    tabs = [...tabs].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }
  const activeTab: TabKey = tabs.includes(tab) ? tab : "overview";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* gallery */}
        <View style={{ height: 250, backgroundColor: colors.surfaceSunken }}>
          {images[imgIndex] ? (
            <Image source={{ uri: images[imgIndex] }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="image" size={48} color={colors.inkFaint} />
            </View>
          )}
          <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 90 }} pointerEvents="none" />
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.28)"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 70 }} pointerEvents="none" />
          <Pressable onPress={() => router.back()} style={{ position: "absolute", top: 12, left: 12, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          {role === "buyer" ? (
            <Pressable onPress={toggleFav} style={{ position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8 }}>
              <Ionicons name={isFav ? "heart" : "heart-outline"} size={22} color={isFav ? colors.brand : "#fff"} />
            </Pressable>
          ) : null}
          <View style={{ position: "absolute", bottom: 12, left: 12, flexDirection: "row", gap: 6 }}>
            {approvalTag ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }}>
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text style={{ color: colors.success, fontSize: 11, fontWeight: "700" }}>{approvalTag}</Text>
              </View>
            ) : null}
            <View style={{ backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }}>
              <Text style={{ color: phase.color, fontSize: 11, fontWeight: "700" }}>{phase.label}</Text>
            </View>
          </View>
          {property.virtual_tour_url ? (
            <Pressable onPress={() => WebBrowser.openBrowserAsync(property.virtual_tour_url!)} style={{ position: "absolute", bottom: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }}>
              <Ionicons name="cube" size={12} color={colors.ink} />
              <Text style={{ color: colors.ink, fontSize: 11, fontWeight: "700" }}>360° Tour</Text>
            </Pressable>
          ) : null}
          {images.length > 1 ? (
            <View style={{ position: "absolute", bottom: 44, alignSelf: "center", flexDirection: "row", gap: 6 }}>
              {images.map((_, i) => (
                <Pressable key={i} onPress={() => setImgIndex(i)} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === imgIndex ? "#fff" : "rgba(255,255,255,0.5)" }} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: T.title.fontSize - 4, fontWeight: "600", color: colors.ink, letterSpacing: -0.5 }}>{property.title}</Text>
          <Text style={{ color: colors.inkFaint, marginTop: 4 }}>
            {[property.locality, property.city, property.district, property.state].filter(Boolean).join(", ")}
          </Text>

          {/* tab bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {tabs.map((k) => {
              const on = k === activeTab;
              return (
                <Pressable key={k} onPress={() => setTab(k)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : colors.border }}>
                  <Ionicons name={TAB_META[k].icon as any} size={15} color={on ? "#fff" : colors.inkSoft} />
                  <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: on ? "600" : "500", fontSize: 13 }}>{TAB_META[k].label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ marginTop: 18 }}>
            {activeTab === "overview" && (
              <Overview property={property} voiceBusy={voiceBusy} translated={translated} showOriginal={showOriginal} onListen={() => speakText(translated && !showOriginal ? translated : property.description!)} onTranslate={() => onTranslate(property.description!)} onToggleOriginal={() => setShowOriginal((v) => !v)} phaseLabel={phase.label} />
            )}
            {activeTab === "photos" && <PhotosTab images={images} active={imgIndex} onSelect={setImgIndex} />}
            {activeTab === "videos" && <VideosTab videos={property.videos ?? []} drone={property.drone_videos ?? []} />}
            {activeTab === "master_plan" && <MasterPlanTab property={property} />}
            {activeTab === "amenities" && <AmenitiesTab amenities={property.amenities ?? []} />}
            {activeTab === "location" && <LocationTab property={property} onMap={onMap} />}
            {activeTab === "legal" && <LegalTab property={property} />}
            {activeTab === "investment" && <InvestmentTab property={property} onCalc={() => router.push("/tools/calculators")} />}
          </View>

          {/* alternatives + similar (always available under the tabs) */}
          {property.price ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>
              <Pressable onPress={() => router.push({ pathname: "/(tabs)/properties", params: { filters: encodeFilters({ types: [property.property_type], budgetMax: property.price! }) } })} style={altChip}>
                <Ionicons name="trending-down" size={16} color={colors.success} />
                <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 13 }}>Cheaper options</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: "/(tabs)/properties", params: { filters: encodeFilters({ types: [property.property_type], budgetMin: property.price! }) } })} style={altChip}>
                <Ionicons name="trending-up" size={16} color={colors.brand} />
                <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 13 }}>Premium options</Text>
              </Pressable>
            </View>
          ) : null}

          {similar && similar.length > 0 ? (
            <>
              <Text style={{ fontWeight: "600", fontSize: 16, color: colors.ink, marginTop: 24, marginBottom: 10 }}>Similar Properties</Text>
              {similar.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/property/${p.id}`)}>
                  <Card style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      {p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="business" size={20} color={colors.inkFaint} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "600", color: colors.ink }} numberOfLines={1}>{p.title}</Text>
                      <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>{[p.locality, p.city].filter(Boolean).join(", ")}</Text>
                    </View>
                    <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>{formatINR(p.price)}</Text>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* persistent action bar */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <QuickAction icon="document-text" label="Brochure" onPress={onBrochure} />
        <QuickAction icon="share-social" label="Share" onPress={onShare} />
        <QuickAction icon="call" label="Call" onPress={onCallback} />
        <Pressable onPress={() => { if (!compare.has(id) && compare.atLimit()) { Alert.alert("Compare", "You can compare up to 3 properties. Remove one first."); return; } compare.toggle(id); }} style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
          <Ionicons name={compare.has(id) ? "checkmark-circle" : "git-compare"} size={22} color={colors.brand} />
          <Text style={{ fontSize: 10, color: colors.inkSoft, marginTop: 3 }}>{compare.has(id) ? "Added" : "Compare"}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Button label="Schedule Site Visit" onPress={onSiteVisit} />
        </View>
      </View>
      <JamindarFab />
    </SafeAreaView>
  );
}

// ─────────────────────────── tab bodies ───────────────────────────

function Overview({ property, voiceBusy, translated, showOriginal, onListen, onTranslate, onToggleOriginal, phaseLabel }: {
  property: Property; voiceBusy: boolean; translated: string | null; showOriginal: boolean;
  onListen: () => void; onTranslate: () => void; onToggleOriginal: () => void; phaseLabel: string;
}) {
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Stat label="Price" value={property.price != null ? formatINR(property.price) : "On request"} accent={colors.brand} />
        <Stat label="Area" value={property.area_value ? formatArea(property.area_value, property.area_unit) : "—"} />
        <Stat label={property.plots_available != null ? "Plots left" : "Status"} value={property.plots_available != null ? `${property.plots_available}/${property.plots_total}` : phaseLabel} gold />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <MetaChip icon="pricetag" label={PROPERTY_TYPE_LABELS[property.property_type]} />
        {property.vastu_facing ? <MetaChip icon="compass" label={`${property.vastu_facing} facing`} /> : null}
        {property.plots_available != null ? <MetaChip icon="grid" label={`${property.plots_available}/${property.plots_total} plots`} /> : null}
        {Object.entries(property.approvals ?? {}).filter(([, v]) => v).map(([k]) => <MetaChip key={k} icon="checkmark-circle" label={k.toUpperCase()} />)}
      </View>

      {property.description ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 8 }}>
            <Text style={{ fontWeight: "600", fontSize: 16, color: colors.ink }}>About this property</Text>
            <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
              {voiceBusy ? <ActivityIndicator color={colors.brand} /> : null}
              <Pressable onPress={onListen} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="volume-high" size={18} color={colors.brand} />
                <Text style={{ color: colors.brand, fontWeight: "600", fontSize: 13 }}>Listen</Text>
              </Pressable>
              <Pressable onPress={onTranslate} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="language" size={18} color={colors.brand} />
                <Text style={{ color: colors.brand, fontWeight: "600", fontSize: 13 }}>{translated ? "Original" : "Translate"}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={{ color: colors.inkSoft, lineHeight: 22 }}>{translated && !showOriginal ? translated : property.description}</Text>
          {translated ? (
            <Pressable onPress={onToggleOriginal} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.brand, fontSize: 12, fontWeight: "600" }}>{showOriginal ? "Show translation" : "Show original"}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function PhotosTab({ images, active, onSelect }: { images: string[]; active: number; onSelect: (i: number) => void }) {
  if (images.length === 0) return <EmptyNote label="No photos uploaded for this property yet." />;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {images.map((uri, i) => (
        <Pressable key={i} onPress={() => onSelect(i)} style={{ width: "48%", height: 120, borderRadius: 14, overflow: "hidden", borderWidth: i === active ? 2 : 0, borderColor: colors.brand }}>
          <Image source={{ uri }} style={{ width: "100%", height: "100%" }} />
        </Pressable>
      ))}
    </View>
  );
}

function VideosTab({ videos, drone }: { videos: string[]; drone: string[] }) {
  const all = [...videos.map((u) => ({ u, d: false })), ...drone.map((u) => ({ u, d: true }))];
  if (all.length === 0) return <EmptyNote label="No videos available for this property." />;
  return (
    <View style={{ gap: 10 }}>
      {all.map((v, i) => (
        <Pressable key={i} onPress={() => WebBrowser.openBrowserAsync(v.u)}>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={v.d ? "airplane" : "play"} size={20} color={colors.brand} />
            </View>
            <Text style={{ flex: 1, fontWeight: "600", color: colors.ink }}>{v.d ? "Drone flyover" : `Walkthrough ${i + 1}`}</Text>
            <Ionicons name="open-outline" size={18} color={colors.inkFaint} />
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

function MasterPlanTab({ property }: { property: Property }) {
  const plots = property.plot_layout ?? [];
  const counts = plots.reduce((a, p) => { const s = p.status ?? "available"; a[s] = (a[s] ?? 0) + 1; return a; }, {} as Record<string, number>);
  return (
    <View style={{ gap: 14 }}>
      {property.master_plan_url ? (
        <Image source={{ uri: property.master_plan_url }} style={{ width: "100%", height: 220, borderRadius: 16, backgroundColor: colors.surfaceSunken }} resizeMode="cover" />
      ) : (
        <EmptyNote label="Master plan image not available for this property." />
      )}
      {plots.length > 0 ? (
        <Card>
          <Text style={{ fontWeight: "600", color: colors.ink, marginBottom: 10 }}>Plot availability</Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <PlotLegend color={colors.success} label={`Available · ${counts.available ?? 0}`} />
            <PlotLegend color={colors.gold} label={`Reserved · ${counts.reserved ?? 0}`} />
            <PlotLegend color={colors.inkFaint} label={`Sold · ${counts.sold ?? 0}`} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function AmenitiesTab({ amenities }: { amenities: string[] }) {
  if (amenities.length === 0) return <EmptyNote label="No amenities listed for this property." />;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {amenities.map((a) => (
        <View key={a} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 }}>
          <Ionicons name="checkmark-circle" size={15} color={colors.success} />
          <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{a}</Text>
        </View>
      ))}
    </View>
  );
}

function LocationTab({ property, onMap }: { property: Property; onMap: () => void }) {
  const { lat, lng } = property;
  const nearby = property.nearby_places?.length ? property.nearby_places : (property.nearby_landmarks ?? []).map((n) => ({ name: n.label, distance: n.distance, category: undefined, duration: undefined }));
  const streetUrl = property.street_view_url || (lat && lng ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}` : null);
  const satUrl = lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&basemap=satellite` : property.gmaps_url;
  const earthUrl = property.google_earth_url || (lat && lng ? `https://earth.google.com/web/search/${lat},${lng}` : null);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <MapTile icon="navigate" label="Map" onPress={onMap} available />
        <MapTile icon="globe" label="Satellite" onPress={() => openUrl(satUrl)} available={!!satUrl} />
        <MapTile icon="walk" label="Street View" onPress={() => openUrl(streetUrl)} available={!!streetUrl} />
        <MapTile icon="planet" label="Google Earth" onPress={() => openUrl(earthUrl)} available={!!earthUrl} />
      </View>
      {nearby.length > 0 ? (
        <Card>
          <Text style={{ fontWeight: "600", color: colors.ink, marginBottom: 8 }}>Nearby</Text>
          {nearby.map((n, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.border }}>
              <Ionicons name="location" size={15} color={colors.brand} />
              <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }}>{n.name}</Text>
              <Text style={{ color: colors.inkFaint, fontSize: 12 }}>{[n.distance, n.duration].filter(Boolean).join(" · ")}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyNote label="Nearby landmarks not added for this property." />
      )}
    </View>
  );
}

function LegalTab({ property }: { property: Property }) {
  const approvals = Object.entries(property.approvals ?? {}).filter(([, v]) => v).map(([k]) => k.toUpperCase());
  const legal = property.legal ?? {};
  const docs = property.documents ?? [];
  const nothing = approvals.length === 0 && !property.rera_number && Object.keys(legal).length === 0 && docs.length === 0;
  if (nothing) return <EmptyNote label="Legal information not available for this property." />;
  return (
    <View style={{ gap: 12 }}>
      {(property.rera_number || approvals.length > 0) ? (
        <Card>
          <Text style={{ fontWeight: "600", color: colors.ink, marginBottom: 8 }}>Approvals</Text>
          {property.rera_number ? <InfoRow label="RERA" value={property.rera_number} /> : null}
          {approvals.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {approvals.map((a) => (
                <View key={a} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.successSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  <Text style={{ color: colors.success, fontSize: 12, fontWeight: "600" }}>{a}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
      {(legal.ownership || legal.encumbrance || legal.notes) ? (
        <Card>
          <Text style={{ fontWeight: "600", color: colors.ink, marginBottom: 8 }}>Legal status</Text>
          {legal.ownership ? <InfoRow label="Ownership" value={legal.ownership} /> : null}
          {legal.encumbrance ? <InfoRow label="Encumbrance" value={legal.encumbrance} /> : null}
          {legal.notes ? <Text style={{ color: colors.inkSoft, fontSize: 13, marginTop: 6, lineHeight: 20 }}>{legal.notes}</Text> : null}
        </Card>
      ) : null}
      {docs.length > 0 ? (
        <Card>
          <Text style={{ fontWeight: "600", color: colors.ink, marginBottom: 8 }}>Documents</Text>
          {docs.map((d, i) => (
            <Pressable key={i} onPress={() => WebBrowser.openBrowserAsync(d.url)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.border }}>
              <Ionicons name="document-text" size={18} color={colors.brand} />
              <Text style={{ flex: 1, color: colors.ink, fontSize: 13 }}>{d.label}</Text>
              {d.size ? <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{d.size}</Text> : null}
              <Ionicons name="download-outline" size={18} color={colors.inkFaint} />
            </Pressable>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function InvestmentTab({ property, onCalc }: { property: Property; onCalc: () => void }) {
  const inv = property.investment ?? {};
  const history = inv.price_history ?? [];
  const hasStats = inv.roi != null || inv.rental_yield != null || inv.appreciation != null;
  return (
    <View style={{ gap: 12 }}>
      {hasStats ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {inv.roi != null ? <Stat label="Est. ROI" value={String(inv.roi)} accent={colors.success} /> : null}
          {inv.rental_yield != null ? <Stat label="Rental yield" value={String(inv.rental_yield)} /> : null}
          {inv.appreciation != null ? <Stat label="Appreciation" value={String(inv.appreciation)} gold /> : null}
        </View>
      ) : null}
      {history.length > 0 ? (
        <Card>
          <Text style={{ fontWeight: "600", color: colors.ink, marginBottom: 8 }}>Price history</Text>
          {history.map((h, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderColor: colors.border }}>
              <Text style={{ color: colors.inkFaint, fontSize: 13 }}>{h.label}</Text>
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>{formatINR(h.value)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {!hasStats && history.length === 0 ? <EmptyNote label="Investment details not available for this property." /> : null}
      <Pressable onPress={onCalc} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.brandSoft }}>
        <Ionicons name="calculator" size={18} color={colors.brand} />
        <Text style={{ color: colors.brand, fontWeight: "700" }}>EMI & registration calculators</Text>
      </Pressable>
    </View>
  );
}

// ─────────────────────────── small pieces ───────────────────────────

const altChip = { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border };

function Stat({ label, value, accent, gold }: { label: string; value: string; accent?: string; gold?: boolean }) {
  return (
    <Card style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 12, ...(gold ? { backgroundColor: colors.goldSoft, borderColor: colors.goldSoft } : {}) }}>
      <Text style={{ color: gold ? colors.goldDark : colors.inkFaint, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: accent ?? colors.ink, fontWeight: "600", fontSize: 15, marginTop: 2 }} numberOfLines={1}>{value}</Text>
    </Card>
  );
}

function MetaChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
      <Ionicons name={icon as any} size={13} color={colors.brand} />
      <Text style={{ color: colors.brand, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
      <Ionicons name={icon as any} size={22} color={colors.brand} />
      <Text style={{ fontSize: 10, color: colors.inkSoft, marginTop: 3 }}>{label}</Text>
    </Pressable>
  );
}

function MapTile({ icon, label, onPress, available }: { icon: string; label: string; onPress: () => void; available: boolean }) {
  return (
    <Pressable onPress={available ? onPress : undefined} disabled={!available} style={{ width: "47%", flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, opacity: available ? 1 : 0.5 }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon as any} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontWeight: "600", fontSize: 13 }}>{label}</Text>
        <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{available ? "Open" : "Not available"}</Text>
      </View>
    </Pressable>
  );
}

function PlotLegend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: colors.inkSoft, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: 16 }}>
      <Text style={{ color: colors.inkFaint, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function EmptyNote({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 30, paddingHorizontal: 20, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
      <Ionicons name="information-circle-outline" size={26} color={colors.inkFaint} />
      <Text style={{ color: colors.inkFaint, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 19 }}>{label}</Text>
    </View>
  );
}
