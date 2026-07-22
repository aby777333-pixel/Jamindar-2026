import { Image, Text, View, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* mascot on white */}
        <SafeAreaView edges={["top"]} style={{ alignItems: "center", paddingTop: 16 }}>
          <Image
            source={require("../assets/namaste.jpg")}
            style={{ width: 190, height: 190, resizeMode: "contain" }}
          />
        </SafeAreaView>

        {/* card */}
        <View
          style={{
            flexGrow: 1,
            backgroundColor: colors.surfaceAlt,
            borderTopLeftRadius: 34,
            borderTopRightRadius: 34,
            marginTop: 4,
            paddingHorizontal: 28,
            paddingTop: 40,
            paddingBottom: Math.max(insets.bottom, 16) + 20,
            alignItems: "center",
          }}
        >
          {/* original Jamin logo (unaltered) */}
          <Image
            source={require("../assets/logo-full.png")}
            style={{ width: 258, height: 258 * (439 / 1095), resizeMode: "contain" }}
          />

          <Text style={{ letterSpacing: 4, color: colors.inkSoft, marginTop: 26, fontSize: 13, fontWeight: "600" }}>
            N A M A S T E  🙏
          </Text>
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.ink, marginTop: 8 }}>
            Welcome to Jamin
          </Text>
          <Text style={{ color: colors.inkFaint, marginTop: 12, textAlign: "center", lineHeight: 21, paddingHorizontal: 8 }}>
            I'm Jamindar, your AI property advisor. I'll help you find the right plot, villa, farm land or home —
            in your language, by voice or text.
          </Text>

          <Button
            label="Get Started"
            onPress={() => router.push("/login")}
            style={{ marginTop: 34, alignSelf: "stretch" }}
          />
          <Text style={{ color: colors.inkFaint, fontSize: 12, textAlign: "center", marginTop: 14 }}>
            Sign in with your mobile number — no passwords, ever.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
