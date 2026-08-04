import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { applyAppFontGlobally } from "@/lib/fonts";
import { initAcquisitionCapture } from "@/lib/acquisition";
import { useTheme } from "@/lib/use-theme";
import { colors } from "@/lib/theme";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { WebShell } from "@/components/WebShell";

SplashScreen.preventAutoHideAsync().catch(() => {});
applyAppFontGlobally();
const queryClient = new QueryClient();

/** Expo Router renders this instead of its red developer box when a screen
 *  below this layout throws. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

export default function RootLayout() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    bootstrap();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshProfile();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // capture referral / QR / campaign attribution from the launch (and live) URL
  useEffect(() => initAcquisitionCapture(), []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Load the saved appearance in the background.
  //
  // ⚠️ Deliberately NOT a render gate. Blocking the tree on this read meant a
  // stored preference could white-screen the whole app if it never resolved —
  // which is exactly what happened. The app now always paints with the default
  // (light); if a saved "dark" arrives a moment later the store updates and the
  // tree remounts. A brief light flash is a fair price for an app that cannot
  // be held hostage by a preference lookup.
  const themeMode = useTheme((s) => s.mode);
  const hydrateTheme = useTheme((s) => s.hydrate);
  useEffect(() => { hydrateTheme(); }, [hydrateTheme]);

  if (!fontsLoaded) return null;

  return (
    // Remounting on `themeMode` is what repaints every screen: the palette is
    // resolved at render time, so a fresh tree picks up the new colours without
    // any of the ~2,035 `colors.x` call sites needing to change.
    <GestureHandlerRootView style={{ flex: 1 }} key={themeMode}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
          {/* Desktop browsers get a centred frame instead of a phone stretched
              to the full monitor width. Identity wrapper on native. */}
          <WebShell>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfaceAlt } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="welcome" />
            <Stack.Screen name="login" />
            <Stack.Screen name="verify" />
            <Stack.Screen name="role" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="property/[id]" options={{ presentation: "card" }} />
            <Stack.Screen name="admin/index" />
            <Stack.Screen name="admin/activity" />
            <Stack.Screen name="admin/desk-contact" />
            <Stack.Screen name="admin/community" />
            <Stack.Screen name="admin/registrations" />
            <Stack.Screen name="admin/kyc" />
            <Stack.Screen name="admin/partners" />
            <Stack.Screen name="admin/properties" />
            <Stack.Screen name="admin/property-edit" />
            <Stack.Screen name="admin/property-media" />
            <Stack.Screen name="promoter/index" />
            <Stack.Screen name="promoter/leads-list" />
            <Stack.Screen name="buyer/onboarding" />
            <Stack.Screen name="buyer/kyc" />
            <Stack.Screen name="buyer/dashboard" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="referral" />
            <Stack.Screen name="saved" />
            <Stack.Screen name="projects" />
            <Stack.Screen name="land-types" />
            <Stack.Screen name="visits" />
            <Stack.Screen name="manage-visits" />
            <Stack.Screen name="messages/index" />
            <Stack.Screen name="messages/[id]" />
            <Stack.Screen name="community/index" />
            <Stack.Screen name="community/new" />
            <Stack.Screen name="community/[id]" />
            <Stack.Screen name="community/clips" />
            <Stack.Screen name="interests" />
            <Stack.Screen name="support" />
            <Stack.Screen name="tools/calculators" />
            <Stack.Screen name="tools/legal" />
            <Stack.Screen name="tools/compare" />
            <Stack.Screen name="jamindar/settings" />
          </Stack>
          </WebShell>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
