import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../lib/theme";
import type { Property } from "../lib/types";

/**
 * Brochure preview.
 *
 * The brochure used to open as a bare link. Nobody taps an unlabelled link to a
 * multi-megabyte file they cannot see, so this shows what they are about to
 * open first — the brochure's own first page, its name and its size — and only
 * then offers to open or share it.
 *
 * Cover falls back to the property's first photo, so a property whose cover has
 * not been generated yet still gets a picture rather than a grey box.
 */
export function BrochureSheet({
  visible,
  property,
  onClose,
  onOpen,
  onShare,
}: {
  visible: boolean;
  property: Property;
  onClose: () => void;
  onOpen: () => void;
  onShare?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  const doc = (property.documents ?? []).find(
    (d) => d.url && property.brochure_url && d.url === property.brochure_url,
  );
  const label = doc?.label || "Project brochure";
  const size = doc?.size;
  const cover = property.brochure_cover_url || property.images?.[0] || null;
  const isRealCover = !!property.brochure_cover_url;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 + insets.bottom }}>
          <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 3, backgroundColor: colors.border, marginBottom: 14 }} />

          <View style={{ flexDirection: "row", gap: 14 }}>
            <View style={{ width: 108, height: 148, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
              {cover ? (
                <>
                  <Image
                    source={{ uri: cover }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode={isRealCover ? "contain" : "cover"}
                    onLoadEnd={() => setLoading(false)}
                  />
                  {loading ? (
                    <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
                      <ActivityIndicator color={colors.inkFaint} />
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="document-text-outline" size={30} color={colors.inkFaint} />
                </View>
              )}
            </View>

            <View style={{ flex: 1, justifyContent: "center", gap: 6 }}>
              <Text style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.inkFaint }}>Brochure</Text>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink, lineHeight: 24 }}>{label}</Text>
              <Text style={{ fontSize: 12.5, color: colors.inkFaint }}>
                {property.title}
                {size ? ` · PDF, ${size}` : " · PDF"}
              </Text>
              {!isRealCover && cover ? (
                <Text style={{ fontSize: 10.5, color: colors.inkFaint }}>Preview image — opens the full brochure</Text>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={onOpen}
            style={{ marginTop: 18, backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
          >
            <Ionicons name="open-outline" size={17} color="#1B1405" />
            <Text style={{ color: "#1B1405", fontSize: 15, fontWeight: "800" }}>Open brochure</Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Pressable
              onPress={() =>
                (onShare ?? (() => Share.share({ message: `${label} — ${property.title}\n${property.brochure_url ?? ""}` }).catch(() => {})))()
              }
              style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 7 }}
            >
              <Ionicons name="share-social-outline" size={16} color={colors.ink} />
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>Share</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 13, alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
