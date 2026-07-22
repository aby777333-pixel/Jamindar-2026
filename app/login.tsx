import { useState } from "react";
import { Text, View, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Button } from "@/components/ui";
import { Brandmark } from "@/components/Brand";
import { Field } from "@/components/Field";
import { sendOtp } from "@/lib/store";
import { colors } from "@/lib/theme";

export default function Login() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);

  const digits = mobile.replace(/[^0-9]/g, "");
  const valid = digits.length >= 10;

  async function onSend() {
    if (!valid) return;
    setLoading(true);
    try {
      const res = await sendOtp(digits);
      router.push({
        pathname: "/verify",
        params: { mobile: digits, devCode: res.devCode ?? "" },
      });
    } catch (e: any) {
      Alert.alert("Couldn't send OTP", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center" }}
      >
        <View style={{ alignItems: "center", marginBottom: 28 }}>
          <Brandmark size={64} />
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.ink, marginTop: 18 }}>
            Enter your mobile
          </Text>
          <Text style={{ color: colors.inkFaint, marginTop: 6, textAlign: "center" }}>
            We'll send a one-time password to verify it's you. No passwords ever.
          </Text>
        </View>

        <Field
          label="Mobile number"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          placeholder="98765 43210"
          maxLength={13}
          autoFocus
        />

        <Button label="Send OTP" onPress={onSend} loading={loading} disabled={!valid} />
        <Text style={{ color: colors.inkFaint, fontSize: 12, textAlign: "center", marginTop: 16 }}>
          By continuing you agree to Jamin's Terms & Privacy Policy.
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
