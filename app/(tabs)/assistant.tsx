import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { JamindarSheet, consumeResume } from "@/components/Jamindar";
import { JamindarFace } from "@/components/Brand";
import { colors, space, type as T } from "@/lib/theme";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui";

export default function AssistantTab() {
  const [open, setOpen] = useState(false);

  // Bug report 18: when Jamindar sends you off to another screen it closes the
  // sheet first (a Modal would cover that screen). Reopen it on the way back so
  // Back returns to the conversation rather than to this splash.
  useFocusEffect(
    useCallback(() => {
      if (consumeResume()) setOpen(true);
    }, []),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.md }}>
        <JamindarFace size={space.xxl + space.md} halo />
        <Text style={{ fontSize: T.title.fontSize, lineHeight: T.title.lineHeight, fontWeight: "800", color: colors.ink, marginTop: space.md }}>
          Meet Jamindar
        </Text>
        <Text style={{ color: colors.inkFaint, textAlign: "center", marginTop: space.xs, fontSize: T.body.fontSize, lineHeight: T.body.lineHeight }}>
          Your multilingual voice guide. Ask about plots, budgets, locations, or legal terms — by
          voice or text, in your own language.
        </Text>
        {/* Explicit width rather than alignSelf: the centred parent was leaving
            the pill hugging its label. paddingHorizontal would not help — on a
            Button it lands on the Pressable OUTSIDE the coloured surface. */}
        <Button label="Start talking" onPress={() => setOpen(true)} style={{ marginTop: space.md, width: "100%" }} />
      </View>
      <JamindarSheet visible={open} onClose={() => setOpen(false)} />
    </SafeAreaView>
  );
}
