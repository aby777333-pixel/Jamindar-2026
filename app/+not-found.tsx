import { Ionicons } from "@expo/vector-icons";
import { Link, Stack, useRouter } from "expo-router";
import { Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, space, type as T } from "@/lib/theme";

/**
 * 404.
 *
 * A dead link used to drop the member on Expo Router's developer screen, which
 * says "Unmatched Route" and shows a file path — fine for us, alarming for a
 * buyer. This says what happened in plain words and always offers a way back,
 * so a stale share link never looks like a broken app.
 */
export default function NotFound() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg }}>
          <View
            style={{
              width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brandSoft,
              alignItems: "center", justifyContent: "center", marginBottom: space.md,
            }}
          >
            <Ionicons name="compass-outline" size={34} color={colors.brand} />
          </View>

          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink, textAlign: "center" }}>
            This page isn't here
          </Text>
          <Text
            style={{
              fontSize: T.callout.fontSize, color: colors.inkSoft, textAlign: "center",
              marginTop: space.xs, lineHeight: 22, maxWidth: 320,
            }}
          >
            The link may be old, or the listing may have been taken down. Everything else is working
            normally.
          </Text>

          <Pressable
            onPress={() => router.replace("/(tabs)/home")}
            style={{
              flexDirection: "row", alignItems: "center", gap: 8, marginTop: space.md,
              backgroundColor: colors.brand, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14,
            }}
          >
            <Ionicons name="home" size={17} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.callout.fontSize }}>Go to home</Text>
          </Pressable>

          <Link href="/(tabs)/properties" asChild>
            <Pressable style={{ marginTop: space.sm, paddingVertical: 10, paddingHorizontal: 16 }}>
              <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>
                Browse properties instead
              </Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    </>
  );
}
