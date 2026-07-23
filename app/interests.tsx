import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Empty } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = {
  callback_request: "Callback requested",
  enquiry: "Enquiry",
  app: "Enquiry",
};

export default function Interests() {
  const router = useRouter();
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["interests", profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<any[]> => {
      const { data } = await supabase
        .from("leads")
        .select("*, property:properties!leads_property_id_fkey(id,title,locality,city)")
        .eq("buyer_id", profile!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>My Interests</Text>
      </View>
      {isLoading ? (
        <Loading />
      ) : data && data.length > 0 ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {data.map((l) => (
            <Pressable key={l.id} onPress={() => l.property?.id && router.push(`/property/${l.property.id}`)}>
              <Card style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="heart-circle" size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", color: colors.ink }} numberOfLines={1}>{l.property?.title ?? "Property"}</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>
                    {SOURCE_LABEL[l.source] ?? "Enquiry"} · {timeAgo(l.created_at)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Empty title="No enquiries yet" subtitle="Request a callback or enquire on a property to track it here." />
      )}
    </SafeAreaView>
  );
}
