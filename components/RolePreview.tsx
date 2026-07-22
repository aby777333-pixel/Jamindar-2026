import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

const PREVIEW_ROLES: UserRole[] = ["super_admin", "promoter", "buyer"];

/** Super-admin-only control to preview the app as any role.
 *  Renders nothing for non-admins. */
export function RolePreviewBar() {
  const profile = useAuth((s) => s.profile);
  const previewRole = useAuth((s) => s.previewRole);
  const setPreviewRole = useAuth((s) => s.setPreviewRole);

  if (profile?.role !== "super_admin") return null;
  const active: UserRole = previewRole ?? "super_admin";

  return (
    <View
      style={{
        backgroundColor: colors.ink,
        borderRadius: 16,
        padding: 12,
        marginTop: 4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Ionicons name="eye" size={15} color={colors.goldLight} />
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.5 }}>
          PREVIEW AS
        </Text>
        {previewRole ? (
          <Text style={{ color: colors.goldLight, fontSize: 11 }}>· viewing {ROLE_LABELS[previewRole]}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {PREVIEW_ROLES.map((r) => {
          const on = active === r;
          return (
            <Pressable
              key={r}
              onPress={() => setPreviewRole(r === "super_admin" ? null : r)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: on ? colors.brand : "rgba(255,255,255,0.08)",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>
                {r === "super_admin" ? "Admin" : ROLE_LABELS[r]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
