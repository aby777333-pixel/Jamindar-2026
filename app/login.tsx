import { useState } from "react";
import { Text, View, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Button } from "@/components/ui";
import { Brandmark } from "@/components/Brand";
import { Field } from "@/components/Field";
import { sendOtp } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";

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
        <View style={{ alignItems: "center", marginBottom: space.lg }}>
          <Brandmark size={64} />
          <Text style={{ fontSize: T.title.fontSize, lineHeight: T.title.lineHeight, fontWeight: "800", color: colors.ink, marginTop: space.md }}>
            Enter your mobile
          </Text>
          <Text style={{ color: colors.inkFaint, fontSize: T.body.fontSize, lineHeight: T.body.lineHeight, marginTop: space.xs, textAlign: "center" }}>
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
        <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, textAlign: "center", marginTop: space.md }}>
          By continuing you agree to Jamin's Terms & Privacy Policy.
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
