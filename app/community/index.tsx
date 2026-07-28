import { useCallback, useRef, useState } from "react";
import { Text, View, FlatList, Pressable, Image, Alert, Linking, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Card, Loading, Empty } from "@/components/ui";
import { colors, space, type as T } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import {
  fetchCommunityFeed,
  toggleCommunityLike,
  removeCommunityPost,
  reportCommunityPost,
  type CommunityPost,
  type CommunityMedia,
} from "@/lib/community";

/** Jamin Community — an open wall for every member: text, links, photos,
 *  videos, PDFs, files and voice notes. Phone numbers & emails in the text are
 *  hidden automatically (server-side) before anything is shown here. */
export default function Community() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["community-feed"],
    queryFn: () => fetchCommunityFeed(),
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const posts = data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>Jamin Community</Text>
        <Pressable onPress={() => router.push("/community/clips" as Href)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.navy, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
          <Ionicons name="play" size={13} color={colors.gold} />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Clips</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Loading label="Loading the community…" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          contentContainerStyle={{ padding: space.md, paddingBottom: 40 + insets.bottom, gap: space.sm }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ gap: space.sm, marginBottom: space.xs }}>
              {/* compose prompt */}
              <Card onPress={() => router.push("/community/new" as Href)} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="create" size={19} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 14 }}>Share something…</Text>
                  <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 1 }}>Text, photos, videos, PDFs, links & voice notes</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              </Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
                <Ionicons name="shield-checkmark" size={13} color={colors.success} />
                <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, flex: 1 }}>
                  Phone numbers & emails in posts are hidden automatically.
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={<Empty title="No posts yet" subtitle="Be the first — share a plot, a question or a site-visit story." />}
          renderItem={({ item }) => (
            <CommunityPostCard
              post={item}
              onOpen={() => router.push(`/community/${item.id}` as Href)}
              onChanged={() => qc.invalidateQueries({ queryKey: ["community-feed"] })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

/** One post — used by the feed; tapping body/comments opens the detail page. */
export function CommunityPostCard({
  post,
  onOpen,
  onChanged,
  hideActions,
}: {
  post: CommunityPost;
  onOpen?: () => void;
  onChanged?: () => void;
  hideActions?: boolean;
}) {
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);

  async function onLike() {
    // optimistic — server state refreshes with the next feed load
    setLiked(!liked);
    setLikes((n) => n + (liked ? -1 : 1));
    try {
      await toggleCommunityLike(post.id, liked);
    } catch {
      setLiked(liked);
      setLikes(post.likes);
    }
  }

  function onReport() {
    Alert.alert("Report this post", "Tell the Jamin team what's wrong:", [
      { text: "Cancel", style: "cancel" },
      { text: "Spam / advertising", onPress: () => reportCommunityPost(post.id, "spam") },
      { text: "Wrong or misleading", onPress: () => reportCommunityPost(post.id, "misleading") },
      { text: "Offensive content", onPress: () => reportCommunityPost(post.id, "offensive") },
    ]);
  }

  function onDelete() {
    Alert.alert("Delete post", "Remove this post from the community?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await removeCommunityPost(post.id).catch(() => {});
          onChanged?.();
        },
      },
    ]);
  }

  const initials = (post.author.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Card style={{ gap: 10 }}>
      {/* author row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {post.author.avatar_url ? (
          <Image source={{ uri: post.author.avatar_url }} style={{ width: 38, height: 38, borderRadius: 19 }} />
        ) : (
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 14 }} numberOfLines={1}>{post.author.name}</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 11.5 }} numberOfLines={1}>
            {[post.author.member_code, timeAgo(post.created_at)].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {post.masked ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons name="shield-checkmark" size={11} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: 10.5, fontWeight: "700" }}>Contacts hidden</Text>
          </View>
        ) : null}
      </View>

      {/* body */}
      {post.body ? (
        <Pressable onPress={onOpen} disabled={!onOpen}>
          <Text style={{ color: colors.ink, fontSize: 14.5, lineHeight: 21 }}>{post.body}</Text>
        </Pressable>
      ) : null}

      {/* links */}
      {post.links?.length ? (
        <View style={{ gap: 6 }}>
          {post.links.map((l) => (
            <Pressable key={l} onPress={() => Linking.openURL(l).catch(() => {})} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="link" size={13} color={colors.brand} />
              <Text style={{ color: colors.brand, fontSize: 13, textDecorationLine: "underline", flex: 1 }} numberOfLines={1}>{l}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <CommunityMediaBlock media={post.media} onOpenVideos={onOpen} />

      {/* actions */}
      {!hideActions ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 2 }}>
          <Pressable onPress={onLike} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons name={liked ? "heart" : "heart-outline"} size={19} color={liked ? colors.brand : colors.inkSoft} />
            <Text style={{ color: liked ? colors.brand : colors.inkSoft, fontWeight: "700", fontSize: 13 }}>{likes}</Text>
          </Pressable>
          {onOpen ? (
            <Pressable onPress={onOpen} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Ionicons name="chatbubble-outline" size={17} color={colors.inkSoft} />
              <Text style={{ color: colors.inkSoft, fontWeight: "700", fontSize: 13 }}>{post.comments}</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          {post.mine ? (
            <Pressable onPress={onDelete} hitSlop={8}>
              <Ionicons name="trash-outline" size={17} color={colors.inkFaint} />
            </Pressable>
          ) : (
            <Pressable onPress={onReport} hitSlop={8}>
              <Ionicons name="flag-outline" size={16} color={colors.inkFaint} />
            </Pressable>
          )}
        </View>
      ) : null}
    </Card>
  );
}

/** Renders a post's mixed media: image grid, video tiles, voice notes, files. */
export function CommunityMediaBlock({ media, onOpenVideos }: { media: CommunityMedia[]; onOpenVideos?: () => void }) {
  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");
  const audios = media.filter((m) => m.type === "audio");
  const files = media.filter((m) => m.type === "pdf" || m.type === "file");
  if (media.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {images.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Image source={{ uri: images[0].url }} style={{ width: "100%", height: 190, borderRadius: 12, backgroundColor: colors.surfaceSunken }} resizeMode="cover" />
          {images.length > 1 ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              {images.slice(1, 4).map((m, i) => (
                <View key={m.url} style={{ flex: 1, height: 74, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surfaceSunken }}>
                  <Image source={{ uri: m.url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  {i === 2 && images.length > 4 ? (
                    <View style={{ position: "absolute", inset: 0 as never, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#fff", fontWeight: "800" }}>+{images.length - 4}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {videos.map((m) => (
        <Pressable key={m.url} onPress={onOpenVideos} style={{ height: 170, borderRadius: 12, backgroundColor: "#10121C", alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="play" size={24} color="#fff" />
          </View>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 8 }}>Tap to watch</Text>
        </Pressable>
      ))}

      {audios.map((m) => (
        <VoiceNoteRow key={m.url} url={m.url} />
      ))}

      {files.map((m) => (
        <Pressable key={m.url} onPress={() => Linking.openURL(m.url).catch(() => {})} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSunken, borderRadius: 12, padding: 12 }}>
          <Ionicons name={m.type === "pdf" ? "document-text" : "document-attach"} size={20} color={colors.brand} />
          <Text style={{ flex: 1, color: colors.ink, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>{m.name || (m.type === "pdf" ? "PDF document" : "File")}</Text>
          <Ionicons name="download-outline" size={17} color={colors.inkFaint} />
        </Pressable>
      ))}
    </View>
  );
}

/** Voice-note player row (play/pause). */
function VoiceNoteRow({ url }: { url: string }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    try {
      if (playing) {
        playerRef.current?.pause();
        setPlaying(false);
        return;
      }
      if (!playerRef.current) playerRef.current = createAudioPlayer(url);
      playerRef.current.seekTo(0);
      playerRef.current.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  return (
    <Pressable onPress={toggle} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceSunken, borderRadius: 12, padding: 12 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={playing ? "pause" : "play"} size={16} color="#fff" />
      </View>
      <Text style={{ color: colors.ink, fontWeight: "600", fontSize: 13 }}>Voice note</Text>
      <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border }} />
      <Ionicons name="mic" size={15} color={colors.inkFaint} />
    </Pressable>
  );
}
