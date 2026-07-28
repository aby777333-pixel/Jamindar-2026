import { useEffect, useState } from "react";
import { Text, View, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen, Button } from "@/components/ui";
import { JamindarFace } from "@/components/Brand";
import { Field } from "@/components/Field";
import { verifyOtp, sendOtp, useAuth } from "@/lib/store";
import { flushPendingAcquisition } from "@/lib/audit";
import { captureInviteCode } from "@/lib/acquisition";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";

export default function Verify() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mobile: string; devCode?: string; newUser?: string; ref?: string }>();
  const mobile = params.mobile ?? "";
  // Referral entry shows only for first-time registrations (bug report 28-07).
  const isNewUser = params.newUser === "1";
  const refreshProfile = useAuth((s) => s.refreshProfile);
  const [code, setCode] = useState(params.devCode ? String(params.devCode) : "");
  // Sign Up passes the referral ID along (report 28-07-2) — prefill it here.
  const [invite, setInvite] = useState(params.ref ? String(params.ref) : "");
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  // Bug fix 28-07: changing the mobile number reuses this screen instance, so
  // the OTP typed for the PREVIOUS number stayed in the field. A different
  // mobile (or a fresh dev code) always starts with a clean form.
  useEffect(() => {
    setCode(params.devCode ? String(params.devCode) : "");
    setInvite(params.ref ? String(params.ref) : "");
    setSeconds(30);
  }, [mobile, params.devCode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onVerify() {
    if (code.length < 4) return;
    setLoading(true);
    try {
      // Optional referral code — but if one is entered it MUST be a real
      // member's code and not the user's own (bug report 28-07, HIGH).
      const inviteCode = invite.trim();
      if (isNewUser && inviteCode) {
        const { data: check, error: vErr } = await supabase.rpc("validate_referral_code", {
          p_code: inviteCode,
          p_mobile: mobile,
        });
        if (!vErr) {
          const v = check as { valid?: boolean; reason?: string } | null;
          if (!v?.valid) {
            Alert.alert(
              "Invalid referral code",
              v?.reason === "self"
                ? "You can't use your own referral code."
                : "That code doesn't match any Jamin member. Check it, or clear the field to continue without one.",
            );
            setLoading(false);
            return;
          }
          captureInviteCode(inviteCode);
        }
      }
      const res = await verifyOtp(mobile, code);
      const profile = await refreshProfile();
      await flushPendingAcquisition(mobile); // one-time referral/acquisition attribution
      // Bug 28-07 (HIGH): clear the welcome/login/verify screens from the
      // back stack — after signing in, Back must never return to login.
      if (router.canGoBack()) router.dismissAll();
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
        <View style={{ alignItems: "center", marginBottom: space.lg }}>
          <JamindarFace size={space.xxl} halo />
          <Text style={{ fontSize: T.title.fontSize, lineHeight: T.title.lineHeight, fontWeight: "800", color: colors.ink, marginTop: space.md }}>
            Verify OTP
          </Text>
          <Text style={{ color: colors.inkFaint, marginTop: space.xs, textAlign: "center", fontSize: T.body.fontSize, lineHeight: T.body.lineHeight }}>
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

        {isNewUser ? (
          <Field
            label="Referral code (optional)"
            value={invite}
            onChangeText={setInvite}
            placeholder="JA-REF-00001"
            autoCapitalize="characters"
            hint="Have an invite from a Jamin member? It's checked before you continue."
          />
        ) : null}

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
