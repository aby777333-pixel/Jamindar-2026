// Compare picker (owner request 27-07): tapping Compare on a property opens
// this bottom sheet listing every live project with checkboxes (max 3), then
// "Compare now" jumps to the side-by-side tool. The zustand compare store
// stays the single source of truth — this sheet just edits it in one step.
import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useCompare, COMPARE_MAX } from "@/lib/compare";
import { colors, space, type as T } from "@/lib/theme";

type Row = { id: string; title: string; locality: string | null; city: string | null; images: string[] | null };

export function CompareSheet({ visible, onClose, currentId }: { visible: boolean; onClose: () => void; currentId?: string }) {
  const router = useRouter();
  const compare = useCompare();
  const [checked, setChecked] = useState<string[]>([]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["compare-sheet-projects"],
    enabled: visible,
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from("properties")
        .select("id,title,locality,city,images")
        .in("status", ["available", "reserved", "sold"])
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(25);
      return (data as Row[]) ?? [];
    },
  });

  // Start from what's already in the compare basket + the property being viewed.
  useEffect(() => {
    if (!visible) return;
    const init = [...new Set([...(currentId ? [currentId] : []), ...compare.ids])];
    setChecked(init.slice(0, COMPARE_MAX));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleRow(id: string) {
    setChecked((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= COMPARE_MAX) {
        Alert.alert("Compare", `You can compare up to ${COMPARE_MAX} projects. Untick one first.`);
        return c;
      }
      return [...c, id];
    });
  }

  function compareNow() {
    compare.clear();
    checked.forEach((id) => compare.toggle(id));
    onClose();
    router.push("/tools/compare");
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(16,18,28,0.45)" }} />
      <View
        style={{
          backgroundColor: colors.surfaceAlt,
          borderTopLeftRadius: space.lg,
          borderTopRightRadius: space.lg,
          paddingTop: space.sm,
          paddingHorizontal: space.md,
          paddingBottom: space.lg,
          maxHeight: "78%",
        }}
      >
        <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: "center", marginBottom: space.sm }} />
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.sm }}>
          <Text style={{ flex: 1, fontSize: T.body.fontSize + 2, fontWeight: "800", color: colors.ink }}>Compare projects</Text>
          <View style={{ backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: colors.brand, fontWeight: "800", fontSize: T.caption.fontSize + 1 }}>
              {checked.length} / {COMPARE_MAX}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, marginBottom: space.sm }}>
          Tick up to {COMPARE_MAX} projects, then compare them side by side.
        </Text>

        <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <Text style={{ color: colors.inkFaint, textAlign: "center", paddingVertical: space.md }}>Loading projects…</Text>
          ) : (
            (rows ?? []).map((r) => {
              const on = checked.includes(r.id);
              const loc = [r.locality, r.city].filter(Boolean).join(", ");
              return (
                <Pressable
                  key={r.id}
                  onPress={() => toggleRow(r.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                    backgroundColor: colors.surface,
                    borderWidth: 1.5,
                    borderColor: on ? colors.brand : colors.border,
                    borderRadius: space.sm + 3,
                    padding: space.xs + 4,
                    marginBottom: space.xs + 2,
                  }}
                >
                  <View style={{ width: 46, height: 46, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center" }}>
                    {r.images?.[0] ? (
                      <Image source={{ uri: r.images[0] }} style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <Ionicons name="business" size={18} color={colors.inkFaint} />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: "700", color: colors.ink, fontSize: T.small.fontSize + 1 }} numberOfLines={1}>
                      {r.title}
                    </Text>
                    {loc ? (
                      <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, marginTop: 1 }} numberOfLines={1}>
                        {loc}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: on ? colors.brand : colors.border,
                      backgroundColor: on ? colors.brand : colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <Button
          label={checked.length >= 2 ? `Compare now (${checked.length})` : "Pick at least 2 projects"}
          onPress={compareNow}
          disabled={checked.length < 2}
          style={{ marginTop: space.sm }}
        />
      </View>
    </Modal>
  );
}
