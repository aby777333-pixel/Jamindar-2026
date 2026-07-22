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
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { applyAppFontGlobally } from "@/lib/fonts";

SplashScreen.preventAutoHideAsync().catch(() => {});
applyAppFontGlobally();
const queryClient = new QueryClient();

export default function RootLayout() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    bootstrap();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshProfile();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F7F7F8" } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="welcome" />
            <Stack.Screen name="login" />
            <Stack.Screen name="verify" />
            <Stack.Screen name="role" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="property/[id]" options={{ presentation: "card" }} />
            <Stack.Screen name="admin/index" />
            <Stack.Screen name="promoter/index" />
            <Stack.Screen name="buyer/onboarding" />
            <Stack.Screen name="tools/calculators" />
            <Stack.Screen name="tools/legal" />
            <Stack.Screen name="tools/compare" />
            <Stack.Screen name="jamindar/settings" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
