import { Image, Text, View, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui";
import { colors, space, type as T } from "@/lib/theme";

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
        {/* mascot on white — larger, occupies the golden top section */}
        <SafeAreaView edges={["top"]} style={{ alignItems: "center", paddingTop: space.md }}>
          <Image
            source={require("../assets/namaste.jpg")}
            style={{ width: 236, height: 236, resizeMode: "contain" }}
          />
        </SafeAreaView>

        {/* card */}
        <View
          style={{
            flexGrow: 1,
            backgroundColor: colors.surfaceAlt,
            borderTopLeftRadius: space.lg,
            borderTopRightRadius: space.lg,
            marginTop: space.xxs,
            paddingHorizontal: space.lg,
            paddingTop: space.lg,
            paddingBottom: Math.max(insets.bottom, space.sm) + space.md,
            alignItems: "center",
          }}
        >
          {/* original Jamin logo on a crisp white badge */}
          <View
            style={{
              width: "82%",
              backgroundColor: "#FFFFFF",
              borderRadius: space.md,
              paddingVertical: space.sm,
              paddingHorizontal: space.md,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Image
              source={require("../assets/logo-badge.png")}
              style={{ width: "100%", height: undefined, aspectRatio: 1095 / 439, resizeMode: "contain" }}
            />
          </View>

          <Text style={{ letterSpacing: 4, color: colors.inkSoft, marginTop: space.lg, fontSize: T.small.fontSize, fontWeight: "600" }}>
            N A M A S T E  🙏
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontSize: T.title.fontSize, lineHeight: T.title.lineHeight, fontWeight: "800", color: colors.ink, marginTop: space.xs, alignSelf: "stretch", textAlign: "center" }}
          >
            Welcome to Jamin Properties
          </Text>
          <Text style={{ color: colors.inkFaint, marginTop: space.sm, textAlign: "center", fontSize: T.body.fontSize, lineHeight: T.body.lineHeight, paddingHorizontal: space.xs }}>
            I'm Jamindar, your AI property advisor. I'll help you find the right plot, villa, farm land or home —
            in your language, by voice or text.
          </Text>

          <Button
            label="Get Started"
            onPress={() => router.push("/login")}
            style={{ marginTop: space.lg, alignSelf: "stretch" }}
          />
          <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, textAlign: "center", marginTop: space.sm }}>
            Sign in with your mobile number — no passwords, ever.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
