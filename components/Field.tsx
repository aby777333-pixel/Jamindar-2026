import { TextInput, View, Text, TextInputProps } from "react-native";
import { colors } from "@/lib/theme";

export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label?: string; hint?: string; error?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text style={{ color: colors.inkSoft, fontWeight: "600", marginBottom: 6, fontSize: 13 }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.inkFaint}
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.border,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 16,
          color: colors.ink,
        }}
        {...props}
      />
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>
      ) : hint ? (
        <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 4 }}>{hint}</Text>
      ) : null}
    </View>
  );
}
