import { useEffect } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/store";
import { Loading } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function Gate() {
  const { loading, profile } = useAuth();

  if (loading)
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <Loading label="Namaste 🙏" />
      </View>
    );

  if (!profile) return <Redirect href="/welcome" />;
  if (!profile.is_profile_complete) return <Redirect href="/role" />;
  return <Redirect href="/(tabs)/home" />;
}
