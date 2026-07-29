import { useEffect, useRef, useState } from "react";
import {
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/store";
import { colors, type as T } from "@/lib/theme";
import { initials } from "@/lib/format";
import {
  useThreads,
  useThreadMessages,
  useThreadParticipants,
  useRealtimeThread,
  sendMessage,
  markThreadRead,
  pickAndSendImage,
  moderateThread,
  removeMessage,
  useRefreshMessaging,
  type Message,
} from "@/lib/messaging";

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
function dayOf(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** One conversation — realtime, with read receipts, photos and property cards. */
export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const threadId = String(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "super_admin";

  const { data: threads } = useThreads();
  const thread = threads?.find((t) => t.thread_id === threadId);
  const { data: messages, isLoading } = useThreadMessages(threadId);
  const { data: participants } = useThreadParticipants(threadId);
  const refresh = useRefreshMessaging();
  useRealtimeThread(threadId);

  const listRef = useRef<FlatList<Message>>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [kb, setKb] = useState(0);

  // Mark read on open and whenever new messages land.
  useEffect(() => {
    if (threadId) markThreadRead(threadId).then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages?.length]);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKb(e.endCoordinates?.height ?? 0);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const otherRead = participants?.find((p) => p.user_id !== profile?.id)?.last_read_at ?? null;
  const locked = !!thread?.is_locked;

  async function onSend() {
    const body = text.trim();
    if (!body || busy) return;
    setText("");
    setBusy(true);
    try {
      await sendMessage(threadId, { body });
      refresh();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      setText(body);
      Alert.alert("Couldn't send", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onAttach() {
    if (!profile?.id || busy) return;
    setBusy(true);
    try {
      await pickAndSendImage(threadId, profile.id);
      refresh();
    } catch (e: any) {
      Alert.alert("Couldn't attach", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onModerate() {
    Alert.alert(
      locked ? "Reopen conversation" : "Close conversation",
      locked
        ? "Participants will be able to send messages again."
        : "Participants will no longer be able to send messages. The history is kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: locked ? "Reopen" : "Close",
          style: locked ? "default" : "destructive",
          onPress: async () => {
            try {
              await moderateThread(threadId, !locked);
              refresh();
            } catch (e: any) {
              Alert.alert("Couldn't update", e?.message ?? "");
            }
          },
        },
      ]
    );
  }

  function onLongPressMessage(m: Message) {
    if (!isAdmin || m.deleted_at) return;
    Alert.alert("Remove this message?", "It will be hidden for everyone. The action is audited.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await removeMessage(m.id);
            refresh();
          } catch (e: any) {
            Alert.alert("Couldn't remove", e?.message ?? "");
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      {/* header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.brand,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {thread?.counterpart_avatar ? (
            <Image source={{ uri: thread.counterpart_avatar }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{initials(thread?.counterpart_name)}</Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 15 }} numberOfLines={1}>
            {thread?.counterpart_name ?? "Jamin Bazaar"}
          </Text>
          <Text style={{ color: colors.inkFaint, fontSize: 11.5 }} numberOfLines={1}>
            {thread?.subject ?? "Secure Jamin conversation"}
          </Text>
        </View>
        {thread?.property_id ? (
          <Pressable onPress={() => router.push(`/property/${thread.property_id}`)} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="business" size={20} color={colors.brand} />
          </Pressable>
        ) : null}
        {isAdmin ? (
          <Pressable onPress={onModerate} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name={locked ? "lock-closed" : "lock-open-outline"} size={20} color={locked ? colors.brand : colors.inkFaint} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          ref={listRef}
          data={messages ?? []}
          keyExtractor={(m) => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1, justifyContent: "flex-end" }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m, index }) => {
            const mine = m.sender_id === profile?.id;
            const prev = (messages ?? [])[index - 1];
            const newDay = !prev || dayOf(prev.created_at) !== dayOf(m.created_at);
            const read = mine && !!otherRead && new Date(otherRead) >= new Date(m.created_at);

            return (
              <View>
                {newDay ? (
                  <Text style={{ textAlign: "center", color: colors.inkFaint, fontSize: 11.5, marginVertical: 10 }}>
                    {dayOf(m.created_at)}
                  </Text>
                ) : null}

                <Pressable
                  onLongPress={() => onLongPressMessage(m)}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                    backgroundColor: mine ? colors.brand : colors.surface,
                    borderWidth: mine ? 0 : 1,
                    borderColor: colors.border,
                    borderRadius: 18,
                    borderBottomRightRadius: mine ? 5 : 18,
                    borderBottomLeftRadius: mine ? 18 : 5,
                    paddingHorizontal: 13,
                    paddingVertical: 9,
                  }}
                >
                  {m.deleted_at ? (
                    <Text style={{ color: mine ? "rgba(255,255,255,0.7)" : colors.inkFaint, fontStyle: "italic", fontSize: 14 }}>
                      Message removed by the Jamin team
                    </Text>
                  ) : (
                    <>
                      {m.kind === "image" && m.attachment_url ? (
                        <Pressable onPress={() => WebBrowser.openBrowserAsync(m.attachment_url!)}>
                          <Image
                            source={{ uri: m.attachment_url }}
                            style={{ width: 210, height: 158, borderRadius: 12, marginBottom: m.body ? 7 : 0 }}
                          />
                        </Pressable>
                      ) : null}

                      {m.kind === "file" && m.attachment_url ? (
                        <Pressable
                          onPress={() => WebBrowser.openBrowserAsync(m.attachment_url!)}
                          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: m.body ? 7 : 0 }}
                        >
                          <Ionicons name="document-text" size={20} color={mine ? "#fff" : colors.brand} />
                          <Text style={{ color: mine ? "#fff" : colors.ink, fontSize: 13.5, fontWeight: "600" }} numberOfLines={1}>
                            {m.attachment_name ?? "Attachment"}
                          </Text>
                        </Pressable>
                      ) : null}

                      {m.kind === "property" && m.property_id ? (
                        <Pressable
                          onPress={() => router.push(`/property/${m.property_id}`)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                            backgroundColor: mine ? "rgba(255,255,255,0.16)" : colors.surfaceSunken,
                            marginBottom: m.body ? 7 : 0,
                          }}
                        >
                          <Ionicons name="business" size={18} color={mine ? "#fff" : colors.brand} />
                          <Text style={{ color: mine ? "#fff" : colors.ink, fontSize: 13, fontWeight: "700" }}>
                            View property
                          </Text>
                        </Pressable>
                      ) : null}

                      {m.body ? (
                        <Text style={{ color: mine ? "#fff" : colors.ink, fontSize: 15, lineHeight: 21 }}>{m.body}</Text>
                      ) : null}
                    </>
                  )}

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 3 }}>
                    <Text style={{ color: mine ? "rgba(255,255,255,0.75)" : colors.inkFaint, fontSize: 10.5 }}>
                      {timeOf(m.created_at)}
                    </Text>
                    {mine ? (
                      <Ionicons
                        name={read ? "checkmark-done" : "checkmark"}
                        size={13}
                        color={read ? "#9BE7FF" : "rgba(255,255,255,0.75)"}
                      />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Ionicons name="chatbubbles-outline" size={30} color={colors.inkFaint} />
              <Text style={{ color: colors.inkFaint, fontSize: 13, marginTop: 8, textAlign: "center" }}>
                Say hello — this conversation stays inside Jamin.
              </Text>
            </View>
          }
        />
      )}

      {/* composer */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: kb > 0 ? 10 : Math.max(insets.bottom, 10) + 6,
          marginBottom: kb,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderColor: colors.border,
        }}
      >
        {locked ? (
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 }}>
            <Ionicons name="lock-closed" size={16} color={colors.inkFaint} />
            <Text style={{ color: colors.inkFaint, fontSize: 13 }}>
              This conversation has been closed by the Jamin team.
            </Text>
          </View>
        ) : (
          <>
            <Pressable onPress={onAttach} disabled={busy} hitSlop={6} style={{ padding: 4 }}>
              <Ionicons name="add-circle" size={28} color={colors.brand} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message…"
              placeholderTextColor={colors.inkFaint}
              multiline
              style={{
                flex: 1,
                maxHeight: 110,
                backgroundColor: colors.surfaceSunken,
                borderRadius: 20,
                paddingHorizontal: 15,
                paddingVertical: 10,
                fontSize: 15,
                color: colors.ink,
              }}
            />
            <Pressable
              onPress={onSend}
              disabled={!text.trim() || busy}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: text.trim() ? colors.brand : colors.surfaceSunken,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={19} color={text.trim() ? "#fff" : colors.inkFaint} />}
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
