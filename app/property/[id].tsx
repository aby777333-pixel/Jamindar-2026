import { useState } from "react";
import { Text, View, ScrollView, Image, Pressable, Alert, Share, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Card, Loading, Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth, useEffectiveRole } from "@/lib/store";
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

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async (): Promise<Property | null> => {
      const { data } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
      return (data as Property) ?? null;
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
          {images.length > 1 ? (
            <View style={{ position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row", gap: 6 }}>
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

          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <Card style={{ flex: 1, paddingVertical: 12 }}>
              <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Price</Text>
              <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 18 }}>{formatINR(property.price)}</Text>
            </Card>
            <Card style={{ flex: 1, paddingVertical: 12 }}>
              <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Area</Text>
              <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 18 }}>
                {formatArea(property.area_value, property.area_unit)}
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
              <Text style={{ fontWeight: "800", fontSize: 16, color: colors.ink, marginTop: 22, marginBottom: 8 }}>
                About this property
              </Text>
              <Text style={{ color: colors.inkSoft, lineHeight: 22 }}>{property.description}</Text>
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
            <ActionButton icon="calendar" label="Site Visit" onPress={onSiteVisit} />
          </View>

          <Button label="Request a Callback" onPress={onCallback} style={{ marginTop: 16 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
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
