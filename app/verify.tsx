import { useEffect, useState } from "react";
import { Text, View, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen, Button } from "@/components/ui";
import { Brandmark } from "@/components/Brand";
import { Field } from "@/components/Field";
import { verifyOtp, sendOtp, useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";

export default function Verify() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mobile: string; devCode?: string }>();
  const mobile = params.mobile ?? "";
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [code, setCode] = useState(params.devCode ? String(params.devCode) : "");
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function onVerify() {
    if (code.length < 4) return;
    setLoading(true);
    try {
      const res = await verifyOtp(mobile, code);
      const profile = await refreshProfile();
      if (profile?.is_profile_complete) {
        router.replace("/(tabs)/home");
      } else if (profile?.role === "super_admin") {
        // allowlisted super admins skip role selection
        router.replace("/profile");
      } else {
        router.replace("/role");
      }
    } catch (e: any) {
      Alert.alert("Verification failed", e?.message ?? "Check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    try {
      const res = await sendOtp(mobile);
      setSeconds(30);
      if (res.devCode) setCode(res.devCode);
    } catch (e: any) {
      Alert.alert("Couldn't resend", e?.message ?? "");
    }
  }

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View style={{ alignItems: "center", marginBottom: 28 }}>
          <Brandmark size={64} />
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.ink, marginTop: 18 }}>
            Verify OTP
          </Text>
          <Text style={{ color: colors.inkFaint, marginTop: 6, textAlign: "center" }}>
            Enter the 6-digit code sent to{"\n"}
            <Text style={{ color: colors.ink, fontWeight: "700" }}>+{mobile}</Text>
          </Text>
        </View>

        <Field
          label="One-time password"
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="••••••"
          maxLength={6}
          autoFocus
          hint={params.devCode ? "Dev mode: code pre-filled" : undefined}
        />

        <Button label="Verify & Continue" onPress={onVerify} loading={loading} disabled={code.length < 4} />

        <View style={{ alignItems: "center", marginTop: 18 }}>
          {seconds > 0 ? (
            <Text style={{ color: colors.inkFaint }}>Resend code in {seconds}s</Text>
          ) : (
            <Text onPress={onResend} style={{ color: colors.brand, fontWeight: "700" }}>
              Resend OTP
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}
