import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { JamindarSheet } from "@/components/Jamindar";
import { JamindarFace } from "@/components/Brand";
import { colors } from "@/lib/theme";
import { useState } from "react";
import { Button } from "@/components/ui";

export default function AssistantTab() {
  const [open, setOpen] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <LinearGradient
            colors={[colors.brandSoft, colors.goldSoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: "absolute", width: 140, height: 140, borderRadius: 70, opacity: 0.9 }}
          />
          <View
            style={{
              borderRadius: 56,
              backgroundColor: "#FFFFFF",
              shadowColor: "#1B1B4B",
              shadowOpacity: 0.12,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 6,
            }}
          >
            <JamindarFace size={108} />
          </View>
        </View>
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
