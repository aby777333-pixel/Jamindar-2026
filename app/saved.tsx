import { Text, View, ScrollView, Pressable, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, type as T } from "@/lib/theme";
import { formatINR } from "@/lib/format";
import type { Property } from "@/lib/types";

export default function Saved() {
  const router = useRouter();
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["saved", profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<Property[]> => {
      const { data } = await supabase
        .from("favorites")
        .select("property:properties!favorites_property_id_fkey(*)")
        .eq("buyer_id", profile!.id)
        .order("created_at", { ascending: false });
      return ((data ?? []).map((r: any) => r.property).filter(Boolean)) as Property[];
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Saved Properties</Text>
      </View>
      {isLoading ? (
        <Loading />
      ) : data && data.length > 0 ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {data.map((p) => (
            <Pressable key={p.id} onPress={() => router.push(`/property/${p.id}`)}>
              <Card style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                  {p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="business" size={22} color={colors.inkFaint} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: colors.ink }} numberOfLines={1}>{p.title}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>{[p.locality, p.city].filter(Boolean).join(", ")}</Text>
                </View>
                <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>{formatINR(p.price)}</Text>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Empty title="No saved properties yet" subtitle="Tap the heart on any property to save it here for later." />
      )}
    </SafeAreaView>
  );
}
