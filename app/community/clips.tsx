import { useState, useEffect, useMemo } from "react";
import { Text, View, FlatList, Pressable, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { colors } from "@/lib/theme";
import { timeAgo } from "@/lib/format";
import { fetchCommunityFeed, toggleCommunityLike, type CommunityPost } from "@/lib/community";

type Clip = { key: string; url: string; post: CommunityPost };

/** Clips — a reel-style vertical player over every video posted in the
 *  community. Swipe up/down to move between clips; the active one plays. */
export default function CommunityClips() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [active, setActive] = useState(0);

  const { data } = useQuery({ queryKey: ["community-feed"], queryFn: () => fetchCommunityFeed() });

  const clips = useMemo<Clip[]>(() => {
    const out: Clip[] = [];
    for (const p of data ?? []) {
      for (const m of p.media ?? []) {
        if (m.type === "video") out.push({ key: `${p.id}:${m.url}`, url: m.url, post: p });
      }
    }
    return out;
  }, [data]);

  const pageH = winH; // full-screen pages

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <FlatList
        data={clips}
        keyExtractor={(c) => c.key}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: pageH, offset: pageH * i, index: i })}
        onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.y / pageH))}
        renderItem={({ item, index }) => (
          <ClipPage clip={item} height={pageH} isActive={index === active} bottomInset={insets.bottom} />
        )}
        ListEmptyComponent={
          <View style={{ height: pageH, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Ionicons name="videocam-off" size={40} color="rgba(255,255,255,0.5)" />
            <Text style={{ color: "rgba(255,255,255,0.75)", textAlign: "center", marginTop: 12, fontSize: 14 }}>
              No clips yet. Post a video in the community and it appears here as a clip.
            </Text>
          </View>
        }
      />
      {/* close */}
      <Pressable
        onPress={() => router.back()}
        style={{ position: "absolute", top: insets.top + 10, left: 14, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 20, padding: 8 }}
      >
        <Ionicons name="close" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

function ClipPage({ clip, height, isActive, bottomInset }: { clip: Clip; height: number; isActive: boolean; bottomInset: number }) {
  const [liked, setLiked] = useState(clip.post.liked);
  const [likes, setLikes] = useState(clip.post.likes);
  const player = useVideoPlayer(clip.url, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    try {
      if (isActive) player.play();
      else player.pause();
    } catch {
      /* player may already be released */
    }
  }, [isActive, player]);

  async function onLike() {
    setLiked(!liked);
    setLikes((n) => n + (liked ? -1 : 1));
    try {
      await toggleCommunityLike(clip.post.id, liked);
    } catch {
      setLiked(liked);
      setLikes(clip.post.likes);
    }
  }

  return (
    <View style={{ height, backgroundColor: "#000" }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} />
      {/* overlay: author + caption + like */}
      <View style={{ position: "absolute", left: 16, right: 76, bottom: bottomInset + 28 }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }} numberOfLines={1}>
          {clip.post.author.name} <Text style={{ color: "rgba(255,255,255,0.6)", fontWeight: "500", fontSize: 12 }}>· {timeAgo(clip.post.created_at)}</Text>
        </Text>
        {clip.post.body ? (
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 4, lineHeight: 18 }} numberOfLines={3}>
            {clip.post.body}
          </Text>
        ) : null}
      </View>
      <View style={{ position: "absolute", right: 16, bottom: bottomInset + 40, alignItems: "center", gap: 4 }}>
        <Pressable onPress={onLike} style={{ alignItems: "center" }}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={30} color={liked ? colors.brand : "#fff"} />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{likes}</Text>
        </Pressable>
      </View>
    </View>
  );
}
