import { useEffect, useMemo, useState } from "react";
import { Text, View, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Button, Card } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";
import { formatINR } from "@/lib/format";

/** Smart Buyer Discovery Questionnaire (migration 0063, owner spec 29-07).
 *
 *  Questions are DATA, not code — they come from `questionnaire_questions`
 *  through the questionnaire_form RPC, so anything the admin adds, edits,
 *  reorders, disables or translates in the console appears here instantly
 *  with no app release. Answers save to questionnaire_answers AND sync into
 *  the existing buyer_preferences columns, so every current consumer
 *  (suggestions, Jamindar memory) keeps working unchanged. Skippable. */

type Q = {
  key: string;
  question: string;
  help: string | null;
  answer_type: string;
  options: { value: string; label: string }[];
  required: boolean;
  unit: string | null;
  min: number | null;
  max: number | null;
  step: number | null;
  show_if: { key: string; any?: string[] } | null;
};
type Answers = Record<string, any>;
type Match = {
  id: string; title: string; city: string | null; price: number | null;
  project_phase: string | null; score: number; reasons: string[];
};

const asArray = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)]);

export default function BuyerQuestionnaire() {
  const router = useRouter();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<Match[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("questionnaire_form", { p_lang: "en" });
        if (error) throw error;
        const d = data as any;
        if (cancelled) return;
        setQuestions((d?.questions ?? []) as Q[]);
        setAnswers((d?.answers ?? {}) as Answers);
      } catch {
        /* the questionnaire is optional — never block the app on it */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  // Conditional questions: only ask what is still relevant (show_if).
  const visible = useMemo(
    () => questions.filter((q) => {
      if (!q.show_if?.key) return true;
      const got = asArray(answers[q.show_if.key]);
      const want = q.show_if.any ?? [];
      return want.length === 0 ? got.length > 0 : got.some((g) => want.includes(g));
    }),
    [questions, answers],
  );

  const q = visible[step];
  const total = visible.length || 1;
  const answered = (key: string) => {
    const v = answers[key];
    return Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "";
  };

  function setAnswer(key: string, value: any) {
    Haptics.selectionAsync().catch(() => {});
    setAnswers((a) => ({ ...a, [key]: value }));
  }
  function toggleMulti(key: string, value: string) {
    const cur = asArray(answers[key]);
    setAnswer(key, cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]);
  }

  async function finish() {
    setSaving(true);
    try {
      const payload: Answers = {};
      for (const item of visible) {
        const v = answers[item.key];
        if (v == null || (Array.isArray(v) && v.length === 0) || String(v).trim?.() === "") continue;
        payload[item.key] = ["number", "slider"].includes(item.answer_type) ? Number(v) : v;
      }
      const { data, error } = await supabase.rpc("questionnaire_save", { p_answers: payload });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error ?? "Could not save");

      const { data: m } = await supabase.rpc("my_property_matches", { p_limit: 6 });
      setDone((((m as any)?.matches ?? []) as Match[]).filter((x) => x.score > 0));
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const goHome = () => router.replace("/(tabs)/home" as Href);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={{ color: colors.inkFaint, marginTop: 12 }}>Preparing a few quick questions…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── results: personalised matches with the reasons why ──
  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: "center", marginTop: space.lg, marginBottom: space.md }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="sparkles" size={30} color={colors.success} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink, marginTop: space.sm, textAlign: "center" }}>
              Thank you{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
            </Text>
            <Text style={{ color: colors.inkFaint, textAlign: "center", marginTop: 6, fontSize: T.small.fontSize }}>
              {done.length ? "Here are the projects that fit you best." : "We'll alert you the moment a matching project arrives."}
            </Text>
          </View>

          {done.map((m) => (
            <Card key={m.id} onPress={() => router.push(`/property/${m.id}` as Href)} style={{ marginBottom: space.sm, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text style={{ flex: 1, fontWeight: "800", color: colors.ink, fontSize: T.small.fontSize + 2 }} numberOfLines={1}>{m.title}</Text>
                <View style={{ backgroundColor: colors.successSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Text style={{ color: colors.success, fontWeight: "800", fontSize: T.caption.fontSize }}>{Math.min(99, m.score)}% match</Text>
                </View>
              </View>
              <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>
                {[m.city, m.price ? formatINR(m.price) : "Price on request"].filter(Boolean).join(" · ")}
              </Text>
              {(m.reasons ?? []).slice(0, 3).map((r) => (
                <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  <Text style={{ color: colors.inkSoft, fontSize: T.caption.fontSize + 1 }}>{r}</Text>
                </View>
              ))}
            </Card>
          ))}

          <Button label="Browse all projects" onPress={() => router.replace("/(tabs)/properties" as Href)} style={{ marginTop: space.sm }} />
          <Pressable onPress={goHome} style={{ alignItems: "center", paddingVertical: space.md }}>
            <Text style={{ color: colors.brand, fontWeight: "700" }}>Go to home</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!q) {
    // No questions configured (admin disabled them all) — never block the user.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg }}>
          <Text style={{ color: colors.inkFaint, textAlign: "center" }}>No questions right now.</Text>
          <Button label="Continue" onPress={goHome} style={{ marginTop: space.md }} />
        </View>
      </SafeAreaView>
    );
  }

  const canAdvance = !q.required || answered(q.key);
  const isLast = step === visible.length - 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      {/* progress + skip */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: space.md, gap: space.sm }}>
        <Pressable onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, height: 6, backgroundColor: colors.surfaceSunken, borderRadius: 3, overflow: "hidden" }}>
          <View style={{ width: `${((step + 1) / total) * 100}%`, height: 6, backgroundColor: colors.brand, borderRadius: 3 }} />
        </View>
        <Text style={{ color: colors.inkFaint, fontSize: T.caption.fontSize + 1 }}>{step + 1}/{total}</Text>
        <Pressable onPress={goHome} hitSlop={8}>
          <Text style={{ color: colors.brand, fontWeight: "700", fontSize: T.small.fontSize }}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xl }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 23, fontWeight: "800", color: colors.ink, lineHeight: 30 }}>{q.question}</Text>
        {q.help ? <Text style={{ color: colors.inkFaint, marginTop: 8, fontSize: T.small.fontSize }}>{q.help}</Text> : null}
        <View style={{ height: space.md }} />

        {/* choice types — cards with accent + checkmark */}
        {["single_select", "multi_select", "dropdown", "radio", "checkbox"].includes(q.answer_type) ? (
          <View style={{ gap: space.xs }}>
            {q.options.map((o) => {
              const multi = q.answer_type === "multi_select" || q.answer_type === "checkbox";
              const on = multi ? asArray(answers[q.key]).includes(o.value) : String(answers[q.key] ?? "") === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => (multi ? toggleMulti(q.key, o.value) : setAnswer(q.key, o.value))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: space.sm,
                    paddingHorizontal: space.md, paddingVertical: 14, borderRadius: 14,
                    backgroundColor: on ? colors.brandSoft : colors.surface,
                    borderWidth: 1.5, borderColor: on ? colors.brand : colors.border,
                  }}
                >
                  <Text style={{ flex: 1, color: on ? colors.brand : colors.inkSoft, fontWeight: on ? "800" : "600", fontSize: T.body.fontSize }}>
                    {o.label}
                  </Text>
                  <Ionicons
                    name={on ? "checkmark-circle" : multi ? "square-outline" : "ellipse-outline"}
                    size={21}
                    color={on ? colors.brand : colors.inkFaint}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* free text / long text */}
        {["text", "textarea"].includes(q.answer_type) ? (
          <TextInput
            value={String(answers[q.key] ?? "")}
            onChangeText={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
            placeholder={q.answer_type === "textarea" ? "Type here…" : "Type your answer"}
            placeholderTextColor={colors.inkFaint}
            multiline={q.answer_type === "textarea"}
            style={{
              backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14,
              paddingHorizontal: space.md, paddingVertical: 14, fontSize: T.body.fontSize, color: colors.ink,
              minHeight: q.answer_type === "textarea" ? 120 : undefined, textAlignVertical: q.answer_type === "textarea" ? "top" : "center",
            }}
          />
        ) : null}

        {/* number / slider-style numeric */}
        {["number", "slider"].includes(q.answer_type) ? (
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              {q.unit ? <Text style={{ fontSize: 20, fontWeight: "800", color: colors.inkSoft }}>{q.unit}</Text> : null}
              <TextInput
                value={String(answers[q.key] ?? "")}
                onChangeText={(v) => setAnswers((a) => ({ ...a, [q.key]: v.replace(/[^0-9.]/g, "") }))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.inkFaint}
                style={{
                  flex: 1, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14,
                  paddingHorizontal: space.md, paddingVertical: 14, fontSize: 20, fontWeight: "700", color: colors.ink,
                }}
              />
            </View>
            {q.key.startsWith("budget") ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.sm }}>
                {[500000, 1000000, 2500000, 5000000, 10000000].map((amt) => (
                  <Pressable
                    key={amt}
                    onPress={() => setAnswer(q.key, String(amt))}
                    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: T.small.fontSize }}>{formatINR(amt)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* date */}
        {q.answer_type === "date" ? (
          <TextInput
            value={String(answers[q.key] ?? "")}
            onChangeText={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
            placeholder="dd/mm/yyyy"
            placeholderTextColor={colors.inkFaint}
            style={{
              backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14,
              paddingHorizontal: space.md, paddingVertical: 14, fontSize: T.body.fontSize, color: colors.ink,
            }}
          />
        ) : null}
      </ScrollView>

      <View style={{ padding: space.md, paddingBottom: space.lg, gap: space.xs }}>
        <Button
          label={isLast ? "See my matches" : "Continue"}
          onPress={() => (isLast ? finish() : setStep((s) => s + 1))}
          loading={saving}
          disabled={!canAdvance}
        />
        {!q.required ? (
          <Pressable onPress={() => (isLast ? finish() : setStep((s) => s + 1))} style={{ alignItems: "center", paddingVertical: 10 }}>
            <Text style={{ color: colors.inkFaint, fontWeight: "600", fontSize: T.small.fontSize }}>Not sure yet — skip this</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
