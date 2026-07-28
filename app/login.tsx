import { useState } from "react";
import { Text, View, KeyboardAvoidingView, Platform, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Button } from "@/components/ui";
import { JamindarFace } from "@/components/Brand";
import { Field } from "@/components/Field";
import { sendOtp } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";

/** Small reassurance row shown under the form — reinforces the value prop
 *  and gives the screen a finished, premium base instead of empty space. */
const TRUST: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "shield-checkmark", label: "Secure OTP" },
  { icon: "language", label: "12 languages" },
  { icon: "mic", label: "Voice or text" },
];

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
      // Referral entry moved to the verify screen and only for FIRST-TIME
      // users (bug report 28-07): existing users go straight to the OTP.
      router.push({
        pathname: "/verify",
        params: { mobile: digits, devCode: res.devCode ?? "", newUser: res.newUser ? "1" : "" },
      });
    } catch (e: any) {
      Alert.alert("Couldn't send OTP", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll={false}>
      {/* Soft decorative glows — brand at top-right, gold at bottom-left —
          give the plain surface some depth without competing with the form. */}
      <LinearGradient
        colors={[colors.brandSoft, "transparent"]}
        style={{ position: "absolute", top: -90, right: -70, width: 280, height: 280, borderRadius: 140 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[colors.goldSoft, "transparent"]}
        style={{ position: "absolute", bottom: -80, left: -80, width: 260, height: 260, borderRadius: 130 }}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* Centered when it fits, scrollable when it doesn't (small screens /
            keyboard open) — with vertical padding so nothing hugs the edges. */}
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: space.lg }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
        <View style={{ alignItems: "center", marginBottom: space.lg }}>
          {/* Jamindar mascot — gold-ring avatar + φ-scaled halo (space.xxl+md). */}
          <View style={{ marginBottom: space.sm }}>
            <JamindarFace size={space.xxl + space.md} halo />
          </View>

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

        {/* Trust row — fills the lower space with a finished, premium base. */}
        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: space.lg }}>
          {TRUST.map((it) => (
            <View key={it.label} style={{ flex: 1, alignItems: "center", paddingHorizontal: space.xxs }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={it.icon} size={18} color={colors.brand} />
              </View>
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1, fontWeight: "600", textAlign: "center", marginTop: 6 }}>
                {it.label}
              </Text>
            </View>
          ))}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
