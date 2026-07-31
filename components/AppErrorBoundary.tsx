import { Ionicons } from "@expo/vector-icons";
import { Text, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, space, type as T } from "@/lib/theme";

/**
 * The screen a member sees if something crashes.
 *
 * Expo Router's default is a red developer box with a stack trace — accurate
 * for us, frightening for a buyer looking at a property worth lakhs. This says
 * what happened, promises their data is safe (nothing here writes on a crash),
 * and gives them a way forward.
 *
 * `retry` is provided by Expo Router when this is exported as `ErrorBoundary`
 * from a layout; it re-mounts the subtree rather than restarting the app, so a
 * transient failure recovers in place.
 *
 * The technical detail stays available but collapsed — support can ask for it
 * without it being the first thing a customer reads.
 */
export function AppErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space.lg }}>
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: 76, height: 76, borderRadius: 38, backgroundColor: colors.goldSoft,
              alignItems: "center", justifyContent: "center", marginBottom: space.md,
            }}
          >
            <Ionicons name="construct-outline" size={34} color={colors.goldDark} />
          </View>

          <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "800", color: colors.ink, textAlign: "center" }}>
            Something went wrong on this screen
          </Text>
          <Text
            style={{
              fontSize: T.callout.fontSize, color: colors.inkSoft, textAlign: "center",
              marginTop: space.xs, lineHeight: 22, maxWidth: 340,
            }}
          >
            Nothing you entered has been lost, and the rest of the app is unaffected. Trying again
            usually clears it.
          </Text>

          <Pressable
            onPress={retry}
            style={{
              flexDirection: "row", alignItems: "center", gap: 8, marginTop: space.md,
              backgroundColor: colors.brand, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14,
            }}
          >
            <Ionicons name="refresh" size={17} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: T.callout.fontSize }}>Try again</Text>
          </Pressable>

          {/* Kept for support, deliberately quiet and last. */}
          <View
            style={{
              marginTop: space.lg, padding: space.sm, borderRadius: 12,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, maxWidth: 360,
            }}
          >
            <Text style={{ fontSize: T.caption.fontSize, fontWeight: "700", color: colors.inkFaint, letterSpacing: 0.5 }}>
              TECHNICAL DETAIL
            </Text>
            <Text style={{ fontSize: T.micro.fontSize, color: colors.inkFaint, marginTop: 4, lineHeight: 17 }}>
              {String(error?.message ?? error ?? "Unknown error").slice(0, 300)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
