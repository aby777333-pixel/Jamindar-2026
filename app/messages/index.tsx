import { useMemo, useState } from "react";
import { Text, View, FlatList, Pressable, Image, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Loading, Empty } from "@/components/ui";
import { colors, type as T } from "@/lib/theme";
import { initials, timeAgo } from "@/lib/format";
import { useThreads, useRealtimeInbox } from "@/lib/messaging";

/** Inbox — every conversation, searchable, with unread badges. */
export default function Messages() {
  const router = useRouter();
  const { data, isLoading } = useThreads();
  useRealtimeInbox();
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((t) =>
      `${t.counterpart_name ?? ""} ${t.subject ?? ""} ${t.last_message_preview ?? ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [data, q]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Messages</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Secure chat inside Jamin</Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 20,
          paddingHorizontal: 14,
          backgroundColor: colors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Ionicons name="search" size={17} color={colors.inkFaint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search conversations…"
          placeholderTextColor={colors.inkFaint}
          style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 10, color: colors.ink }}
        />
      </View>

      {isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty
          title={q ? "No matching conversations" : "No messages yet"}
          subtitle={
            q
              ? "Try a different name or keyword."
              : "Start a chat from any property using Contact → In-app chat."
          }
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.thread_id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 10 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: t }) => (
            <Pressable onPress={() => router.push(`/messages/${t.thread_id}` as Href)}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: colors.brand,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {t.counterpart_avatar ? (
                    <Image source={{ uri: t.counterpart_avatar }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>
                      {initials(t.counterpart_name)}
                    </Text>
                  )}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ flex: 1, fontWeight: "700", color: colors.ink, fontSize: 15 }} numberOfLines={1}>
                      {t.counterpart_name ?? "Jamin Bazaar"}
                    </Text>
                    <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{timeAgo(t.last_message_at)}</Text>
                  </View>
                  {t.subject ? (
                    <Text style={{ color: colors.brand, fontSize: 11.5, fontWeight: "600", marginTop: 1 }} numberOfLines={1}>
                      {t.subject}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                    <Text
                      style={{ flex: 1, color: t.unread > 0 ? colors.ink : colors.inkFaint, fontSize: 13, fontWeight: t.unread > 0 ? "600" : "400" }}
                      numberOfLines={1}
                    >
                      {t.is_locked ? "🔒 Closed by the Jamin team" : t.last_message_preview ?? "No messages yet"}
                    </Text>
                    {t.unread > 0 ? (
                      <View
                        style={{
                          minWidth: 22,
                          height: 22,
                          paddingHorizontal: 6,
                          borderRadius: 11,
                          backgroundColor: colors.brand,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{t.unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
