import { useState } from "react";
import { Text, View, KeyboardAvoidingView, Platform, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Button } from "@/components/ui";
import { JamindarFace } from "@/components/Brand";
import { Field } from "@/components/Field";
import { sendOtp } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { colors, space, type as T } from "@/lib/theme";

/** Report 28-07-2: dedicated Sign Up page — mobile number plus a Referral ID
 *  field, so invited users register with their referrer attached. The OTP
 *  path is the same as login; the referral code rides along to /verify where
 *  attach_referral stores the relationship. */
export default function SignUp() {
  const router = useRouter();
  // Arriving from Login with an unrecognised number: the OTP is already on its
  // way, so it rides along rather than being sent a second time (bug report 18
  // — a second send would hit the rate limit and kill the first code).
  const params = useLocalSearchParams<{ mobile?: string; devCode?: string; otpSent?: string }>();
  const [mobile, setMobile] = useState(String(params.mobile ?? ""));
  const [invite, setInvite] = useState("");
  const [loading, setLoading] = useState(false);
  /** Set when the typed number turns out to belong to an existing member. */
  const [registered, setRegistered] = useState<{ code: string } | null>(null);

  const digits = mobile.replace(/[^0-9]/g, "");
  const valid = digits.length === 10;

  // Only reuse the handed-over code while the number is still the one it was
  // sent to — edit the field and we must send a fresh one.
  const carriedFor = String(params.mobile ?? "");
  const otpAlreadySent = params.otpSent === "1" && digits === carriedFor;

  async function onRegister() {
    if (!valid || loading) return;
    setLoading(true);
    try {
      // A referral ID is optional, but when present it must be a real
      // member's code and not the user's own (same rule as /verify).
      const inviteCode = invite.trim();
      if (inviteCode) {
        const { data: check, error: vErr } = await supabase.rpc("validate_referral_code", {
          p_code: inviteCode,
          p_mobile: digits,
        });
        if (!vErr) {
          const v = check as { valid?: boolean; reason?: string } | null;
          if (!v?.valid) {
            Alert.alert(
              "Invalid referral ID",
              v?.reason === "self"
                ? "You can't use your own referral code."
                : "That referral ID doesn't match any Jamin member. Check it, or clear the field to continue without one.",
            );
            setLoading(false);
            return;
          }
        }
      }
      if (otpAlreadySent) {
        // Login already sent it for this exact number — go straight on.
        router.push({
          pathname: "/verify",
          params: { mobile: digits, devCode: String(params.devCode ?? ""), newUser: "1", ref: inviteCode },
        });
        return;
      }

      const res = await sendOtp(digits);

      // Bug report 18: Sign Up used to log an existing member straight into
      // their account and silently drop the referral ID they had typed, since
      // no new account was being created. Sign Up is for new members now.
      //
      // Shown inline rather than as an Alert — Alert is a no-op on
      // react-native-web, and this needs an action attached to it.
      if (!res.newUser) {
        setRegistered({ code: res.devCode ?? "" });
        return;
      }

      router.push({
        pathname: "/verify",
        params: {
          mobile: digits,
          devCode: res.devCode ?? "",
          newUser: "1",
          ref: inviteCode,
        },
      });
    } catch (e: any) {
      Alert.alert("Couldn't start registration", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll={false}>
      <LinearGradient
        colors={[colors.goldSoft, "transparent"]}
        style={{ position: "absolute", top: -90, right: -70, width: 280, height: 280, borderRadius: 140 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[colors.brandSoft, "transparent"]}
        style={{ position: "absolute", bottom: -80, left: -80, width: 260, height: 260, borderRadius: 130 }}
        pointerEvents="none"
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: space.lg }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={{ alignItems: "center", marginBottom: space.lg }}>
            <View style={{ marginBottom: space.sm }}>
              <JamindarFace size={space.xxl + space.md} halo />
            </View>
            <Text style={{ fontSize: T.title.fontSize, lineHeight: T.title.lineHeight, fontWeight: "800", color: colors.ink, marginTop: space.md }}>
              Create your account
            </Text>
            <Text style={{ color: colors.inkFaint, fontSize: T.body.fontSize, lineHeight: T.body.lineHeight, marginTop: space.xs, textAlign: "center" }}>
              Register with your mobile number. Have an invite from a Jamin member? Add their referral ID below.
            </Text>
          </View>

          {/* Arrived here because Login did not recognise the number. */}
          {params.otpSent === "1" && !registered ? (
            <View style={{ flexDirection: "row", gap: 10, backgroundColor: colors.brandSoft, borderRadius: 14, padding: 14, marginBottom: space.sm }}>
              <Ionicons name="person-add" size={18} color={colors.brand} />
              <Text style={{ flex: 1, color: colors.ink, fontSize: T.small.fontSize, lineHeight: 19 }}>
                No Jamin account on this number yet — let's create one. Add a referral ID if a member
                invited you, then continue to your verification code.
              </Text>
            </View>
          ) : null}

          {/* The number is already a member's — Sign Up is for new members. */}
          {registered ? (
            <View style={{ backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: "rgba(224,164,35,0.45)", borderRadius: 14, padding: 14, marginBottom: space.sm }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Ionicons name="information-circle" size={18} color={colors.goldDark} />
                <Text style={{ flex: 1, color: colors.ink, fontSize: T.small.fontSize, lineHeight: 19 }}>
                  This mobile number is already registered. Please log in to continue — your
                  verification code has just been sent to it.
                </Text>
              </View>
              <Button
                label="Log in instead"
                onPress={() =>
                  router.replace({
                    pathname: "/verify",
                    params: { mobile: digits, devCode: registered.code, newUser: "" },
                  })
                }
                style={{ marginTop: space.sm }}
              />
            </View>
          ) : null}

          <Field
            label="Mobile number"
            value={mobile}
            onChangeText={(t) => {
              setRegistered(null);
              setMobile(t.replace(/\D/g, "").slice(0, 10));
            }}
            keyboardType="number-pad"
            placeholder="98765 43210"
            maxLength={10}
            hint="10-digit mobile number"
            autoFocus
          />
          <Field
            label="Referral ID (optional)"
            value={invite}
            onChangeText={setInvite}
            placeholder="JA-REF-00001"
            autoCapitalize="characters"
            hint="Your referrer gets credited once you register."
          />

          <Button label="Sign Up" onPress={onRegister} loading={loading} disabled={!valid} />

          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, marginTop: space.md }}>
            <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize }}>Already a member?</Text>
            <Text onPress={() => router.back()} style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>
              Log in
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginTop: space.lg }}>
            <Ionicons name="shield-checkmark" size={18} color={colors.success} />
            <Text style={{ flex: 1, color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: 19 }}>
              Secure OTP verification — no passwords ever. Your referral relationship is stored for rewards tracking.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
