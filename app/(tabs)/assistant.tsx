import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { JamindarSheet } from "@/components/Jamindar";
import { JamindarFace } from "@/components/Brand";
import { colors, space, type as T } from "@/lib/theme";
import { useState } from "react";
import { Button } from "@/components/ui";

export default function AssistantTab() {
  const [open, setOpen] = useState(false);
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
        {/* paddingHorizontal here would land on the Pressable OUTSIDE the
            coloured pill; the Button carries its own padding, so just let it
            stretch inside the screen's padding for even margins all round. */}
        <Button label="Start talking" onPress={() => setOpen(true)} style={{ marginTop: space.md, alignSelf: "stretch" }} />
      </View>
      <JamindarSheet visible={open} onClose={() => setOpen(false)} />
    </SafeAreaView>
  );
}
