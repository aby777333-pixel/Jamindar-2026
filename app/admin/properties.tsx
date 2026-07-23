import { Text, View, ScrollView, Pressable, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors, type as T } from "@/lib/theme";
import { formatINR } from "@/lib/format";
import type { Property } from "@/lib/types";

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  draft: { bg: colors.surfaceSunken, fg: colors.inkFaint },
  available: { bg: colors.successSoft, fg: colors.success },
  reserved: { bg: colors.goldSoft, fg: colors.goldDark },
  sold: { bg: colors.brandSoft, fg: colors.brand },
  archived: { bg: colors.surfaceSunken, fg: colors.inkFaint },
};

export default function AdminProperties() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-properties"],
    queryFn: async (): Promise<Property[]> => {
      const { data } = await supabase.from("properties").select("*").order("created_at", { ascending: false }).limit(200);
      return (data as Property[]) ?? [];
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Properties</Text>
        <Pressable onPress={() => router.push("/admin/property-edit" as Href)} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brand, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 }}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>New</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Loading />
      ) : data && data.length > 0 ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {data.map((p) => {
            const st = STATUS_TONE[p.status] ?? STATUS_TONE.draft;
            return (
              <Pressable key={p.id} onPress={() => router.push({ pathname: "/admin/property-edit", params: { id: p.id } } as any)}>
                <Card style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                    {p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="business" size={20} color={colors.inkFaint} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", color: colors.ink }} numberOfLines={1}>{p.title}</Text>
                    <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>{[p.locality, p.city].filter(Boolean).join(", ") || formatINR(p.price)}</Text>
                  </View>
                  <View style={{ backgroundColor: st.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: st.fg, fontSize: 11, fontWeight: "700", textTransform: "capitalize" }}>{p.status}</Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Empty title="No properties yet" subtitle="Tap New to create your first listing." />
      )}
    </SafeAreaView>
  );
}
