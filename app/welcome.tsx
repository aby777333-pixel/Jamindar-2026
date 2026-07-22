import { Image, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui";
import { Wordmark } from "@/components/Brand";
import { colors, tileAccents } from "@/lib/theme";

const previewTiles = [
  { label: "Properties", icon: "business", accent: tileAccents.green },
  { label: "Investments", icon: "trending-up", accent: tileAccents.indigo },
  { label: "Activity", icon: "notifications", accent: tileAccents.red },
  { label: "Account", icon: "person", accent: tileAccents.violet },
  { label: "Calculator", icon: "calculator", accent: tileAccents.blue },
  { label: "Projects", icon: "map", accent: tileAccents.teal },
  { label: "Community", icon: "chatbubbles", accent: tileAccents.amber },
  { label: "Support", icon: "help-buoy", accent: tileAccents.rose },
] as const;

export default function Welcome() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* mascot */}
      <View style={{ alignItems: "center", paddingTop: 60 }}>
        <Image
          source={require("../assets/namaste.jpg")}
          style={{ width: 200, height: 200, resizeMode: "contain" }}
        />
      </View>

      {/* card */}
      <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.surfaceAlt,
            borderTopLeftRadius: 34,
            borderTopRightRadius: 34,
            marginTop: 8,
            paddingHorizontal: 24,
            paddingTop: 24,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Wordmark size="md" />
            <Text style={{ letterSpacing: 4, color: colors.inkSoft, marginTop: 16, fontSize: 13, fontWeight: "600" }}>
              N A M A S T E  🙏
            </Text>
            <Text style={{ fontSize: 26, fontWeight: "800", color: colors.ink, marginTop: 6 }}>
              Welcome to Jamin
            </Text>
            <Text style={{ color: colors.inkFaint, marginTop: 4 }}>Signature for Fortune</Text>
          </View>

          {/* module preview grid */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              marginTop: 22,
              rowGap: 12,
            }}
          >
            {previewTiles.map((t) => (
              <View key={t.label} style={{ width: "23%", alignItems: "center" }}>
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 16,
                    backgroundColor: t.accent.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={t.icon as any} size={24} color={t.accent.fg} />
                </View>
                <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 6 }} numberOfLines={1}>
                  {t.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flex: 1 }} />
          <Button label="Continue" onPress={() => router.push("/login")} style={{ marginBottom: 8 }} />
        </View>
      </SafeAreaView>
    </View>
  );
}
