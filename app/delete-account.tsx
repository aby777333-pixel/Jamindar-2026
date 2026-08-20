import { useState } from "react";
import { Text, View, Pressable, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card } from "@/components/ui";
import { Field } from "@/components/Field";
import { deleteMyAccount } from "@/lib/account";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";

/**
 * The in-app account deletion Google Play requires and the published policy
 * has promised all along ("Open Jamin Bazaar → Profile → Delete Account").
 * Until this screen existed, the only working path was emailing the office.
 *
 * A SCREEN, NOT AN ALERT, because the deletion is irreversible and the policy
 * makes specific promises about what goes and what stays — the user must be
 * able to read them at the moment of decision, and Play reviewers look for
 * exactly that. The typed phrase mirrors what the server demands: the RPC
 * refuses anything but "DELETE", so the ceremony here is the same ceremony
 * the database performs.
 */
export default function DeleteAccount() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  const armed = phrase.trim() === "DELETE";
  const isAdmin = profile?.role === "super_admin";

  function confirm() {
    Alert.alert(
      "Delete account?",
      "This is permanent and cannot be undone. You will be signed out immediately.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete my account", style: "destructive", onPress: run },
      ],
    );
  }

  async function run() {
    setBusy(true);
    try {
      await deleteMyAccount(phrase.trim());
      // The account no longer exists in any signable form — drop the local
      // session and land on Welcome, exactly as the policy describes.
      await signOut();
      router.replace("/welcome");
      Alert.alert("Account deleted", "Your account and personal data have been removed.");
    } catch (e: any) {
      Alert.alert("Couldn't delete account", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen avoidKeyboard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: space.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "600", color: colors.ink, letterSpacing: -0.4 }}>
          Delete account
        </Text>
      </View>

      {isAdmin ? (
        <Card>
          <Text style={{ color: colors.ink, fontWeight: "600", marginBottom: 6 }}>
            Administrator accounts can't be deleted here
          </Text>
          <Text style={{ color: colors.inkSoft, lineHeight: 20 }}>
            Please write to info@jaminbazaar.in to remove an administrator account.
          </Text>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: space.md }}>
            <Text style={{ color: colors.ink, fontWeight: "700", marginBottom: 8 }}>What is deleted</Text>
            {[
              "Your login, name, mobile number, email and address",
              "KYC documents you uploaded — removed from storage",
              "Your photo, saved plots, site visits, enquiries and messages",
              "Jamindar conversations and notifications",
            ].map((t) => (
              <Text key={t} style={{ color: colors.inkSoft, lineHeight: 20, marginBottom: 4 }}>
                {"•"}  {t}
              </Text>
            ))}
          </Card>

          <Card style={{ marginBottom: space.md }}>
            <Text style={{ color: colors.ink, fontWeight: "700", marginBottom: 8 }}>What is kept, and why</Text>
            <Text style={{ color: colors.inkSoft, lineHeight: 20 }}>
              Indian law requires records of confirmed bookings and completed property transactions
              (including the identity records behind them) to be kept for 8 years from the end of the
              financial year. They are stored restricted and never used to contact you. Deleting your
              account does not cancel a booking — see the Booking & refund policy first if you have
              one in progress.
            </Text>
          </Card>

          <Card style={{ marginBottom: space.md }}>
            <Text style={{ color: colors.ink, fontWeight: "700", marginBottom: 8 }}>
              This cannot be undone
            </Text>
            <Text style={{ color: colors.inkSoft, lineHeight: 20, marginBottom: 14 }}>
              You can register again later with the same mobile number, but it will be a brand-new
              account with no history, and KYC starts over. To continue, type DELETE below.
            </Text>
            <Field
              label='Type "DELETE" to confirm'
              value={phrase}
              onChangeText={setPhrase}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
            />
            <Pressable
              onPress={confirm}
              disabled={!armed || busy}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 16,
                borderRadius: 16,
                backgroundColor: armed && !busy ? colors.danger : colors.surfaceSunken,
              }}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={20} color={armed ? "#fff" : colors.inkFaint} />
                  <Text style={{ color: armed ? "#fff" : colors.inkFaint, fontWeight: "700" }}>
                    Delete my account permanently
                  </Text>
                </>
              )}
            </Pressable>
          </Card>
        </>
      )}
    </Screen>
  );
}
