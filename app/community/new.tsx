import { useState } from "react";
import { Text, View, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
import { Button } from "@/components/ui";
import { ZoomableImageViewer } from "@/components/ImageViewer";
import { openExternal } from "@/lib/browser";
import { colors, space, type as T } from "@/lib/theme";
import {
  createCommunityPost,
  pickCommunityMedia,
  captureCommunityMedia,
  COMMUNITY_VIDEO_MAX_SECONDS,
  pickCommunityDocuments,
  uploadVoiceNote,
  type CommunityMedia,
} from "@/lib/community";

/** Compose a community post — text + any mix of photos, videos, documents and
 *  a voice note. The server masks phone numbers & emails in the text before
 *  publishing and records them for the admin team. */
export default function NewCommunityPost() {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<CommunityMedia[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [posting, setPosting] = useState(false);
  const [preview, setPreview] = useState<CommunityMedia | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  /** Preview one attachment before posting (bug report 22). */
  function openAttachment(m: CommunityMedia) {
    if (m.type === "image") setPreview(m);
    else openExternal(m.url);
  }

  function warnSkipped(skipped: string[]) {
    if (skipped.length) Alert.alert("Some files were too large", `Files over 50 MB were skipped:\n${skipped.join("\n")}`);
  }

  async function addMedia() {
    setUploading("media");
    try {
      const res = await pickCommunityMedia();
      setMedia((m) => [...m, ...res.media]);
      warnSkipped(res.skipped);
    } catch (e: any) {
      Alert.alert("Couldn't add media", e?.message ?? "Please try again.");
    } finally {
      setUploading(null);
    }
  }

  /** Shoot something now rather than picking one that already exists. The
   *  gallery tile is untouched — this sits beside it. */
  async function captureMedia() {
    Alert.alert("Camera", "What would you like to capture?", [
      { text: "Take a photo", onPress: () => runCapture("photo") },
      { text: `Record a video (up to ${Math.round(COMMUNITY_VIDEO_MAX_SECONDS / 60)} min)`, onPress: () => runCapture("video") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function runCapture(kind: "photo" | "video") {
    setUploading("camera");
    try {
      const res = await captureCommunityMedia(kind);
      setMedia((m) => [...m, ...res.media]);
      // A long clip can outgrow the upload limit, so say why rather than
      // dropping it silently.
      if (res.skipped.length) {
        Alert.alert(
          "That clip is too large",
          "Recorded video over 50 MB can't be uploaded. Record a shorter clip, or lower your camera's video resolution in its settings.",
        );
      }
    } catch (e: any) {
      Alert.alert("Couldn't use the camera", e?.message ?? "Please try again.");
    } finally {
      setUploading(null);
    }
  }

  async function addDocs() {
    setUploading("docs");
    try {
      const res = await pickCommunityDocuments();
      setMedia((m) => [...m, ...res.media]);
      warnSkipped(res.skipped);
    } catch (e: any) {
      Alert.alert("Couldn't add documents", e?.message ?? "Please try again.");
    } finally {
      setUploading(null);
    }
  }

  async function toggleVoice() {
    if (recording) {
      setRecording(false);
      setUploading("voice");
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        const uri = recorder.uri;
        if (uri) {
          const note = await uploadVoiceNote(uri);
          setMedia((m) => [...m, note]);
        }
      } catch (e: any) {
        Alert.alert("Couldn't save the voice note", e?.message ?? "Please try again.");
      } finally {
        setUploading(null);
      }
      return;
    }
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone needed", "Please allow microphone access to record a voice note.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  async function onPost() {
    if (posting || uploading) return;
    if (!body.trim() && media.length === 0) {
      Alert.alert("Empty post", "Write something or attach a photo, video, document or voice note.");
      return;
    }
    setPosting(true);
    try {
      await createCommunityPost({ body: body.trim(), media });
      qc.invalidateQueries({ queryKey: ["community-feed"] });
      qc.invalidateQueries({ queryKey: ["community-stats"] });
      Alert.alert("Posted 🎉", "Your post is live in the Jamin Community.", [{ text: "Done", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Couldn't post", e?.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  }

  const attach: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }[] = [
    { key: "media", icon: "images", label: "Photos & videos", onPress: addMedia },
    { key: "camera", icon: "camera", label: "Camera", onPress: captureMedia },
    { key: "docs", icon: "document-attach", label: "PDF / files", onPress: addDocs },
    { key: "voice", icon: recording ? "stop-circle" : "mic", label: recording ? "Stop recording" : "Voice note", onPress: toggleVoice, active: recording },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink }}>New post</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 24, gap: space.sm }} keyboardShouldPersistTaps="handled">
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Share a plot, a question, a site-visit story, a link…"
            placeholderTextColor={colors.inkFaint}
            multiline
            style={{ minHeight: 140, textAlignVertical: "top", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, fontSize: 15, color: colors.ink, lineHeight: 22 }}
            autoFocus
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="shield-checkmark" size={13} color={colors.success} />
            <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, flex: 1 }}>
              Phone numbers & emails in your text are hidden automatically when published.
            </Text>
          </View>

          {/* attach row */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {attach.map((a) => (
              <Pressable
                key={a.key}
                onPress={a.onPress}
                disabled={!!uploading && uploading !== a.key}
                style={{ flex: 1, alignItems: "center", gap: 6, backgroundColor: a.active ? colors.brand : colors.surface, borderWidth: 1, borderColor: a.active ? colors.brand : colors.border, borderRadius: 14, paddingVertical: 14 }}
              >
                {uploading === a.key ? (
                  <ActivityIndicator color={a.active ? "#fff" : colors.brand} />
                ) : (
                  <Ionicons name={a.icon} size={20} color={a.active ? "#fff" : colors.brand} />
                )}
                <Text style={{ color: a.active ? "#fff" : colors.inkSoft, fontWeight: "700", fontSize: 11.5, textAlign: "center" }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
          {recording ? (
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 12.5, textAlign: "center" }}>● Recording… tap "Stop recording" when done.</Text>
          ) : null}

          {/* Attachments (bug report 22: these rows were inert — you could not
              check WHAT you had attached before publishing). A row now opens the
              file: photos in the pinch-zoom viewer, everything else in the
              in-app browser, which handles PDFs, video and audio. */}
          {media.length > 0 ? (
            <View style={{ gap: 8 }}>
              {media.map((m, i) => (
                <Pressable
                  key={m.url + i}
                  onPress={() => openAttachment(m)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8 }}
                >
                  {m.type === "image" ? (
                    <Image source={{ uri: m.url }} style={{ width: 44, height: 44, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={m.type === "video" ? "videocam" : m.type === "audio" ? "mic" : m.type === "pdf" ? "document-text" : "document-attach"} size={18} color={colors.brand} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>
                      {m.name || (m.type === "image" ? "Photo" : m.type === "video" ? "Video" : m.type === "audio" ? "Voice note" : "File")}
                    </Text>
                    <Text style={{ color: colors.inkFaint, fontSize: 11, marginTop: 1 }}>Tap to preview</Text>
                  </View>
                  {/* Remove stays its own hit target — tapping the row previews,
                      tapping the cross detaches. */}
                  <Pressable onPress={() => setMedia((all) => all.filter((_, j) => j !== i))} hitSlop={10} style={{ padding: 2 }}>
                    <Ionicons name="close-circle" size={20} color={colors.inkFaint} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: space.md, paddingBottom: Math.max(insets.bottom, 10) + 6 }}>
          <Button label={posting ? "Posting…" : "Post to community"} onPress={onPost} loading={posting} disabled={!!uploading || recording} />
        </View>
      </KeyboardAvoidingView>

      <ZoomableImageViewer
        visible={!!preview}
        uri={preview?.url ?? null}
        title={preview?.name || "Attached photo"}
        onClose={() => setPreview(null)}
      />
    </SafeAreaView>
  );
}
