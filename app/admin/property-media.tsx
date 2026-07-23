import { useState } from "react";
import { Text, View, ScrollView, Pressable, Image, Alert, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Loading } from "@/components/ui";
import { colors, space, type as T } from "@/lib/theme";
import {
  listMedia, pickAndAddImages, pickAndAddVideos, addLink, setPrimary, moveMedia, removeMedia, updateMedia,
  MEDIA_KINDS, AUDIENCES, type PropertyMedia,
} from "@/lib/property-media";

const KIND_LABEL: Record<string, string> = Object.fromEntries(MEDIA_KINDS.map((k) => [k.key, k.label]));
const DOC_KINDS = MEDIA_KINDS.filter((k) => k.group === "document");

export default function PropertyMediaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [linkKind, setLinkKind] = useState("brochure");
  const [linkUrl, setLinkUrl] = useState("");

  const { data: media, isLoading } = useQuery({
    queryKey: ["property-media", id],
    enabled: !!id,
    queryFn: () => listMedia(id!),
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["property-media", id] }); qc.invalidateQueries({ queryKey: ["admin-properties"] }); qc.invalidateQueries({ queryKey: ["property", id] }); };
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    try { await fn(); refresh(); }
    catch (e: any) { Alert.alert("Something went wrong", e?.message ?? "Please try again."); }
    finally { setBusy(false); }
  }

  const photos = (media ?? []).filter((m) => m.kind === "image");
  const docs = (media ?? []).filter((m) => m.kind !== "image");

  if (isLoading) return <Loading />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.ink} /></Pressable>
        <Text style={{ flex: 1, fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>Photos & documents</Text>
        {busy ? <ActivityIndicator color={colors.brand} /> : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Photos */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>Photos & videos</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => run(() => pickAndAddImages(id!, "image"))} style={addBtn}><Ionicons name="image" size={14} color="#fff" /><Text style={addBtnT}>Photos</Text></Pressable>
            <Pressable onPress={() => run(() => pickAndAddVideos(id!))} style={[addBtn, { backgroundColor: colors.ink }]}><Ionicons name="videocam" size={14} color="#fff" /><Text style={addBtnT}>Videos</Text></Pressable>
          </View>
        </View>
        <Text style={{ color: colors.inkFaint, fontSize: 12, marginBottom: 10 }}>The ★ photo is the primary thumbnail. Reorder with the arrows.</Text>
        {photos.length === 0 ? (
          <EmptyBox label="No photos yet. Add high-resolution images — the first becomes the thumbnail." />
        ) : (
          <View style={{ gap: 10 }}>
            {photos.map((m, i) => (
              <Card key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8 }}>
                <View style={{ width: 60, height: 60, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surfaceSunken }}>
                  <Image source={{ uri: m.url }} style={{ width: "100%", height: "100%" }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink }}>{m.is_primary ? "★ Primary" : `Photo ${i + 1}`}</Text>
                  <Pressable onPress={() => run(() => setPrimary(id!, m.id))}><Text style={{ color: m.is_primary ? colors.inkFaint : colors.brand, fontSize: 11, marginTop: 3 }}>{m.is_primary ? "Thumbnail" : "Set as thumbnail"}</Text></Pressable>
                </View>
                <Pressable onPress={() => run(() => moveMedia(photos, m.id, -1))} hitSlop={6} style={iconBtn}><Ionicons name="chevron-up" size={18} color={colors.inkSoft} /></Pressable>
                <Pressable onPress={() => run(() => moveMedia(photos, m.id, 1))} hitSlop={6} style={iconBtn}><Ionicons name="chevron-down" size={18} color={colors.inkSoft} /></Pressable>
                <Pressable onPress={() => Alert.alert("Remove photo?", "", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => run(() => removeMedia(m.id)) }])} hitSlop={6} style={iconBtn}><Ionicons name="trash" size={16} color={colors.danger} /></Pressable>
              </Card>
            ))}
          </View>
        )}

        {/* Documents */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.lg, marginBottom: space.sm }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>Documents & materials <Text style={{ color: colors.inkFaint, fontSize: 12 }}>· {docs.length}</Text></Text>
        </View>

        {/* add a document photo (scanned) under a category */}
        <Card style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.ink, marginBottom: 8 }}>Add document</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {DOC_KINDS.map((k) => {
              const on = linkKind === k.key;
              return <Pressable key={k.key} onPress={() => setLinkKind(k.key)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : colors.border }}><Text style={{ color: on ? "#fff" : colors.inkSoft, fontSize: 11, fontWeight: "600" }}>{k.label}</Text></Pressable>;
            })}
          </View>
          <Pressable onPress={() => run(() => pickAndAddImages(id!, linkKind))} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.brandSoft }}>
            <Ionicons name="cloud-upload-outline" size={17} color={colors.brand} /><Text style={{ color: colors.brand, fontWeight: "600", fontSize: 12.5 }}>Upload a “{KIND_LABEL[linkKind]}” photo/scan</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TextInput value={linkUrl} onChangeText={setLinkUrl} placeholder="…or paste a PDF / tour link" placeholderTextColor={colors.inkFaint} autoCapitalize="none" style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, color: colors.ink }} />
            <Pressable onPress={() => { if (!linkUrl.trim()) return; run(() => addLink(id!, linkKind, linkUrl).then(() => setLinkUrl(""))); }} style={{ paddingHorizontal: 14, justifyContent: "center", borderRadius: 10, backgroundColor: colors.brand }}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Add</Text></Pressable>
          </View>
        </Card>

        {docs.length === 0 ? (
          <EmptyBox label="No documents yet. Add brochures, plans, legal papers, RERA, NOCs and more." />
        ) : (
          <View style={{ gap: 10 }}>
            {docs.map((m) => (
              <Card key={m.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={m.kind === "virtual_tour" ? "cube" : m.kind === "video" || m.kind === "drone" ? "videocam" : "document-text"} size={17} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.ink }}>{KIND_LABEL[m.kind] ?? m.kind}</Text>
                    <Text style={{ fontSize: 10.5, color: colors.inkFaint }} numberOfLines={1}>{m.caption || m.url}</Text>
                  </View>
                  <Pressable onPress={() => Alert.alert("Remove?", "", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => run(() => removeMedia(m.id)) }])} hitSlop={6} style={iconBtn}><Ionicons name="trash" size={16} color={colors.danger} /></Pressable>
                </View>
                {/* visibility */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {AUDIENCES.map((a) => {
                    const on = m.visibility?.includes(a);
                    return (
                      <Pressable key={a} onPress={() => run(() => updateMedia(m.id, { visibility: on ? m.visibility.filter((x) => x !== a) : [...(m.visibility ?? []), a] }))} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? colors.successSoft : colors.surface, borderWidth: 1, borderColor: on ? colors.success : colors.border }}>
                        {on ? <Ionicons name="eye" size={11} color={colors.success} /> : <Ionicons name="eye-off" size={11} color={colors.inkFaint} />}
                        <Text style={{ fontSize: 10, fontWeight: "600", color: on ? colors.success : colors.inkFaint, textTransform: "capitalize" }}>{a}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const addBtn = { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, backgroundColor: colors.brand, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999 };
const addBtnT = { color: "#fff", fontWeight: "600" as const, fontSize: 12 };
const iconBtn = { width: 30, height: 30, borderRadius: 9, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.surfaceSunken };

function EmptyBox({ label }: { label: string }) {
  return <View style={{ alignItems: "center", paddingVertical: 24, paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border }}><Ionicons name="images-outline" size={24} color={colors.inkFaint} /><Text style={{ color: colors.inkFaint, fontSize: 12, textAlign: "center", marginTop: 8, lineHeight: 18 }}>{label}</Text></View>;
}
