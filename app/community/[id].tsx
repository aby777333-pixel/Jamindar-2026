import { useState } from "react";
import { Text, View, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { Card, Loading, Empty } from "@/components/ui";
import { colors, space, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import { CommunityPostCard } from "./index";
import { fetchCommunityPost, addCommunityComment } from "@/lib/community";

/** One community post with its videos playable inline + the comment thread. */
export default function CommunityPostScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const { data: post, isLoading, refetch } = useQuery({
    queryKey: ["community-post", id],
    enabled: !!id,
    queryFn: () => fetchCommunityPost(String(id)),
  });

  async function onSend() {
    const body = comment.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addCommunityComment(String(id), body);
      setComment("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["community-feed"] });
    } catch (e: any) {
      Alert.alert("Couldn't comment", e?.message ?? "Please try again.");
    } finally {
      setSending(false);
    }
  }

  const videos = post?.media?.filter((m) => m.type === "video") ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Post</Text>
      </View>

      {isLoading ? (
        <Loading />
      ) : !post ? (
        <Empty title="Post unavailable" subtitle="It may have been removed." />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 20, gap: space.sm }} showsVerticalScrollIndicator={false}>
            <CommunityPostCard post={post} onChanged={() => { refetch(); qc.invalidateQueries({ queryKey: ["community-feed"] }); }} />

            {/* videos play here (the feed shows a tap-to-watch tile) */}
            {videos.map((v) => (
              <CommunityVideo key={v.url} uri={v.url} />
            ))}

            <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 15, marginTop: 4 }}>
              Comments {post.comments_list.length ? `(${post.comments_list.length})` : ""}
            </Text>
            {post.comments_list.length === 0 ? (
              <Text style={{ color: colors.inkFaint, fontSize: 13 }}>No comments yet — say something nice.</Text>
            ) : (
              post.comments_list.map((c) => (
                <Card key={c.id} style={{ gap: 4, paddingVertical: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 13 }} numberOfLines={1}>{c.author.name}</Text>
                    <Text style={{ color: colors.inkFaint, fontSize: 11 }}>{timeAgo(c.created_at)}</Text>
                    {c.masked ? <Ionicons name="shield-checkmark" size={12} color={colors.success} /> : null}
                  </View>
                  <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20 }}>{c.body}</Text>
                </Card>
              ))
            )}
          </ScrollView>

          {/* comment composer */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: space.md, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) + 6, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border }}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Write a comment… (contacts are hidden automatically)"
              placeholderTextColor={colors.inkFaint}
              style={{ flex: 1, backgroundColor: colors.surfaceSunken, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, color: colors.ink, fontSize: 14 }}
              returnKeyType="send"
              onSubmitEditing={onSend}
            />
            <Pressable onPress={onSend} disabled={sending || !comment.trim()} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: comment.trim() ? colors.brand : colors.border, alignItems: "center", justifyContent: "center" }}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={17} color="#fff" />}
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function CommunityVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <VideoView player={player} style={{ width: "100%", height: 230, borderRadius: 14, backgroundColor: "#000" }} contentFit="contain" nativeControls />
  );
}
