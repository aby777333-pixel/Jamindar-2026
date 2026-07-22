import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { JamindarSheet } from "@/components/Jamindar";
import { Brandmark } from "@/components/Brand";
import { colors } from "@/lib/theme";
import { useState } from "react";
import { Button } from "@/components/ui";

export default function AssistantTab() {
  const [open, setOpen] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <Brandmark size={84} />
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.ink, marginTop: 20 }}>
          Meet Jamindar
        </Text>
        <Text style={{ color: colors.inkFaint, textAlign: "center", marginTop: 8, lineHeight: 21 }}>
          Your multilingual voice guide. Ask about plots, budgets, locations, or legal terms — by
          voice or text, in your own language.
        </Text>
        <Button label="Start talking" onPress={() => setOpen(true)} style={{ marginTop: 24, paddingHorizontal: 40 }} />
      </View>
      <JamindarSheet visible={open} onClose={() => setOpen(false)} />
    </SafeAreaView>
  );
}
