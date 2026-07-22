import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  createAudioPlayer,
  type AudioPlayer,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import { colors } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { useAuth, useEffectiveRole } from "@/lib/store";
import {
  jamindarChat,
  synthesizeSpeech,
  transcribeSpeech,
  loadMemory,
  saveMemory,
  getOrCreateConversation,
  loadConversationMessages,
  JAMINDAR_LANGUAGES,
  DEFAULT_VOICE_PREFS,
  type VoicePrefs,
  type JamindarMemory,
  type ChatMsg,
} from "@/lib/jamindar";
import { parseIntent } from "@/lib/jamindar-intents";
import {
  parseSearchQuery,
  hasSearchFilters,
  searchProperties,
  describeFilters,
  encodeFilters,
  type SearchFilters,
} from "@/lib/property-search";
import { formatINR } from "@/lib/format";
import { computeSuggestions } from "@/lib/suggestions";
import type { Property } from "@/lib/types";
import { Brandmark } from "./Brand";

type UIMsg = ChatMsg & { results?: Property[]; filters?: SearchFilters; options?: { label: string; value: string }[] };

// Guided profile intake — Jamindar asks these once and remembers the answers.
type IntakeStep = {
  field: string;
  q: string;
  options?: { label: string; value: string }[];
  parse: (raw: string) => unknown;
};
const YES = /\b(yes|yeah|yep|first|new|haan|ஆம்|हाँ)\b/i;
const PROFILE_STEPS: IntakeStep[] = [
  { field: "call_name", q: "First, what should I call you?", parse: (r) => r.trim().slice(0, 40) },
  {
    field: "is_first_time_buyer",
    q: "Is this your first time buying a property?",
    options: [{ label: "Yes, first time", value: "yes" }, { label: "No, bought before", value: "no" }],
    parse: (r) => YES.test(r),
  },
  {
    field: "residency",
    q: "Are you an Indian resident or an NRI?",
    options: [{ label: "Resident", value: "resident" }, { label: "NRI", value: "nri" }],
    parse: (r) => (/nri/i.test(r) ? "nri" : "resident"),
  },
  { field: "occupation", q: "What do you do for work?", parse: (r) => r.trim().slice(0, 60) },
  {
    field: "buying_with",
    q: "Are you buying on your own, or with family?",
    options: [{ label: "On my own", value: "alone" }, { label: "With family", value: "family" }],
    parse: (r) => (/family|wife|husband|parent|together/i.test(r) ? "family" : "alone"),
  },
  { field: "decision_maker", q: "And who will make the final decision?", parse: (r) => r.trim().slice(0, 60) },
  { field: "heard_from", q: "Lastly, how did you hear about Jamin?", parse: (r) => r.trim().slice(0, 80) },
];

/** Floating Jamindar assistant button + conversational sheet.
 *  Fully usable by touch; voice is additive. Drop it on any screen. */
export function JamindarFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          setOpen(true);
        }}
        style={{
          position: "absolute",
          right: 18,
          bottom: 90,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: colors.brand,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.brand,
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Ionicons name="mic" size={26} color="#fff" />
      </Pressable>
      <JamindarSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function JamindarSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const role = useEffectiveRole();
  const [msgs, setMsgs] = useState<UIMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [intakeStep, setIntakeStep] = useState<number | null>(null);
  const [language, setLanguage] = useState("en-IN");
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);
  const [memory, setMemory] = useState<JamindarMemory | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [recording, setRecording] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Load memory, voice prefs and resume the last conversation on open.
  useEffect(() => {
    if (!visible || !profile?.id) return;
    let cancelled = false;
    (async () => {
      const mem = await loadMemory(profile.id).catch(() => null);
      if (cancelled) return;
      if (mem) {
        setMemory(mem);
        if (mem.language) setLanguage(mem.language);
        if (mem.voice_prefs) setPrefs({ ...DEFAULT_VOICE_PREFS, ...mem.voice_prefs });
      }
      const convId = await getOrCreateConversation(profile.id, mem?.language ?? "en-IN").catch(() => undefined);
      if (cancelled) return;
      setConversationId(convId);
      if (convId) {
        const prior = await loadConversationMessages(convId).catch(() => []);
        if (cancelled) return;
        if (prior.length > 0) {
          setMsgs(prior);
          return;
        }
      }
      const name = mem?.call_name ? `, ${mem.call_name}` : "";
      // New buyer with no profile yet → warmly offer a short intake.
      const newBuyer = role === "buyer" && !mem?.call_name;
      if (newBuyer) {
        setMsgs([
          {
            role: "assistant",
            content:
              "Namaste 🙏 I'm Jamindar, your property advisor. To help you better, may I ask a few quick questions? You can say 'skip' anytime.",
          },
          { role: "assistant", content: PROFILE_STEPS[0].q, options: PROFILE_STEPS[0].options },
        ]);
        setIntakeStep(0);
        return;
      }
      setMsgs([
        {
          role: "assistant",
          content: `Namaste${name} 🙏 I'm Jamindar, your property advisor. Ask me about plots, budgets, legal terms, or say "open properties", "book a site visit" — by voice or text.`,
        },
      ]);

      // proactive nudge for returning buyers (no audio surprise on open)
      if (role === "buyer") {
        try {
          const sugg = await computeSuggestions(profile.id);
          const match = sugg.find((s) => s.key === "matches");
          if (!cancelled && match) {
            setMsgs((m) => [...m, { role: "assistant", content: `By the way, ${match.title.toLowerCase()}. Say "show my matches" and I'll pull them up.` }]);
          }
        } catch {
          /* optional */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, profile?.id]);

  const speakSeq = useRef(0);

  function stopSpeaking() {
    speakSeq.current += 1; // invalidate any in-flight playback loop
    try {
      playerRef.current?.remove();
    } catch {
      /* ignore */
    }
    playerRef.current = null;
  }

  // Play one WAV chunk fully, resolving only when it finishes (or a safety timeout).
  function playChunkToEnd(uri: string): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const player = createAudioPlayer({ uri });
      playerRef.current = player;
      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          sub?.remove();
        } catch {
          /* ignore */
        }
        resolve();
      };
      const sub = player.addListener("playbackStatusUpdate", (st: any) => {
        if (st?.didJustFinish) finish();
      });
      try {
        player.play();
      } catch {
        finish();
        return;
      }
      // safety fallback: resolve a little after the reported duration
      setTimeout(() => {
        const secs = player.duration && isFinite(player.duration) ? player.duration : 12;
        setTimeout(finish, secs * 1000 + 600);
      }, 300);
    });
  }

  async function playReply(text: string) {
    if (!prefs.readAloud) return;
    stopSpeaking();
    const mySeq = speakSeq.current;
    try {
      const chunks = await synthesizeSpeech(text, language, { speaker: prefs.speaker, pace: prefs.pace });
      for (let i = 0; i < chunks.length; i++) {
        if (speakSeq.current !== mySeq) return; // interrupted
        await playChunkToEnd(`data:audio/wav;base64,${chunks[i]}`);
      }
    } catch {
      /* voice optional — silent fallback */
    }
  }

  function pushAssistant(content: string, speak = true, extra?: Partial<UIMsg>) {
    setMsgs((m) => [...m, { role: "assistant", content, ...extra }]);
    if (speak) playReply(content);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }

  // Natural-language property search: filters listings and shows results inline.
  async function runSearch(filters: SearchFilters) {
    setBusy(true);
    try {
      const results = await searchProperties(filters);
      const desc = describeFilters(filters);
      if (results.length === 0) {
        pushAssistant(`I couldn't find ${desc} right now. Try widening the budget or location, and I'll look again.`);
      } else {
        pushAssistant(
          `I found ${results.length} ${results.length === 1 ? "match" : "matches"} for ${desc}. Here are the top ones — tap any to see details.`,
          true,
          { results: results.slice(0, 4), filters }
        );
      }
    } catch {
      pushAssistant("Sorry, I couldn't run that search just now. Please try again.", false);
    } finally {
      setBusy(false);
    }
  }

  // Guided profile intake: capture one answer and advance, saving incrementally.
  async function handleIntakeAnswer(raw: string) {
    if (intakeStep === null) return;
    if (/^\s*(skip|later|not now|no thanks|maybe later)\s*$/i.test(raw)) {
      setIntakeStep(null);
      pushAssistant("No problem — we can do that anytime. How can I help you today?");
      return;
    }
    const s = PROFILE_STEPS[intakeStep];
    const value = s.parse(raw);
    const patch = { [s.field]: value } as Record<string, unknown>;
    setMemory((prev) => ({ ...(prev ?? {}), ...patch }));
    if (profile?.id) saveMemory(profile.id, patch).catch(() => {});

    const next = intakeStep + 1;
    if (next < PROFILE_STEPS.length) {
      setIntakeStep(next);
      const ns = PROFILE_STEPS[next];
      pushAssistant(ns.q, true, { options: ns.options });
    } else {
      setIntakeStep(null);
      pushAssistant(
        "Perfect, thank you 🙏 That helps me a lot. Now tell me what kind of property you're looking for, or ask me anything — budget, legal terms, or a site visit.",
      );
    }
  }

  // Try to handle an utterance as a navigation/action command first.
  // Returns true if handled (so we skip the chat model).
  async function handleIntent(text: string): Promise<boolean> {
    const intent = parseIntent(text, role);
    if (intent.kind === "none") return false;

    if (intent.kind === "navigate") {
      pushAssistant(intent.say);
      setTimeout(() => {
        onClose();
        router.push(intent.href);
      }, 500);
      return true;
    }

    // actions
    if (intent.action === "stop") {
      stopSpeaking();
      return true;
    }
    if (intent.action === "change_language" && intent.arg) {
      setLanguage(intent.arg);
      if (profile?.id) {
        const { saveMemory } = await import("@/lib/jamindar");
        saveMemory(profile.id, { language: intent.arg }).catch(() => {});
      }
      pushAssistant(intent.say);
      return true;
    }
    if (intent.action === "sign_out") {
      pushAssistant(intent.say, prefs.spokenConfirm);
      Alert.alert("Sign out", "Sign out of Jamin?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            onClose();
            signOut().then(() => router.replace("/welcome"));
          },
        },
      ]);
      return true;
    }
    return false;
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: clean }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);

    // 0) guided profile intake takes priority while active
    if (intakeStep !== null) {
      await handleIntakeAnswer(clean);
      return;
    }

    // 1a) "show my matches" — use the buyer's saved preferences
    if (/\b(my matches|matches for me|what'?s new for me|show my preferences)\b/i.test(clean) && profile?.id) {
      setBusy(true);
      try {
        const { data: prefs } = await supabase.from("buyer_preferences").select("*").eq("buyer_id", profile.id).maybeSingle();
        if (prefs) {
          await runSearch({
            types: prefs.property_types ?? undefined,
            city: prefs.city ?? undefined,
            budgetMax: prefs.budget_max ?? undefined,
            budgetMin: prefs.budget_min ?? undefined,
          });
        } else {
          pushAssistant("I don't have your preferences yet. Tell me your budget, location and property type, or open Preferences to set them.");
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // 1) property search — if the utterance carries real filters, run a live search
    const filters = parseSearchQuery(clean);
    if (hasSearchFilters(filters)) {
      await runSearch(filters);
      return;
    }

    // 2) voice-navigation / command layer
    const handled = await handleIntent(clean);
    if (handled) return;

    // 3) consultant brain
    setBusy(true);
    try {
      const history: ChatMsg[] = [...msgs, { role: "user" as const, content: clean }].slice(-16);
      const reply = await jamindarChat(history, { language, conversationId, memory });
      pushAssistant(reply);
    } catch {
      pushAssistant("Sorry, I couldn't reach the assistant just now. Please try again.", false);
    } finally {
      setBusy(false);
    }
  }

  async function startVoice() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      stopSpeaking();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      setRecording(false);
    }
  }

  async function stopVoice() {
    try {
      setRecording(false);
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) return;
      setBusy(true);
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const { transcript, language: detected } = await transcribeSpeech(b64);
      if (detected) setLanguage(detected);
      if (transcript) await send(transcript);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surfaceAlt,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            height: "85%",
            paddingTop: 14,
          }}
        >
          {/* header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 10 }}>
            <Brandmark size={34} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 17, color: colors.ink }}>Jamindar</Text>
              <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Your voice property guide</Text>
            </View>
            <Pressable onPress={() => router.push("/jamindar/settings")} style={{ padding: 6 }}>
              <Ionicons name="options" size={20} color={colors.inkSoft} />
            </Pressable>
            <Pressable onPress={() => setPrefs((p) => ({ ...p, readAloud: !p.readAloud }))} style={{ padding: 6 }}>
              <Ionicons name={prefs.readAloud ? "volume-high" : "volume-mute"} size={22} color={colors.inkSoft} />
            </Pressable>
            <Pressable onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={24} color={colors.inkSoft} />
            </Pressable>
          </View>

          {/* language chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 10, maxHeight: 42 }}
            contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}
          >
            {JAMINDAR_LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => {
                  setLanguage(l.code);
                  if (profile?.id) import("@/lib/jamindar").then((m) => m.saveMemory(profile.id, { language: l.code }).catch(() => {}));
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: language === l.code ? colors.brand : colors.surface,
                  borderWidth: 1,
                  borderColor: language === l.code ? colors.brand : colors.border,
                }}
              >
                <Text style={{ color: language === l.code ? "#fff" : colors.inkSoft, fontSize: 13, fontWeight: "600" }}>
                  {l.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* conversation */}
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1, marginTop: 10 }}
            contentContainerStyle={{ padding: 18, gap: 10 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {msgs.map((m, i) => (
              <View key={i} style={{ gap: 8 }}>
                <View
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    backgroundColor: m.role === "user" ? colors.brand : colors.surface,
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    maxWidth: "86%",
                    borderWidth: m.role === "user" ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: m.role === "user" ? "#fff" : colors.ink, fontSize: 15, lineHeight: 21 }}>
                    {m.content}
                  </Text>
                </View>

                {m.results?.length ? (
                  <View style={{ gap: 8 }}>
                    {m.results.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          onClose();
                          router.push(`/property/${p.id}`);
                        }}
                        style={{ flexDirection: "row", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 8, alignItems: "center" }}
                      >
                        <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: colors.surfaceSunken, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {p.images?.[0] ? (
                            <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: "100%" }} />
                          ) : (
                            <Ionicons name="business" size={22} color={colors.inkFaint} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: "700", color: colors.ink, fontSize: 14 }} numberOfLines={1}>
                            {p.title}
                          </Text>
                          <Text style={{ color: colors.inkFaint, fontSize: 12 }} numberOfLines={1}>
                            {[p.locality, p.city].filter(Boolean).join(", ")}
                          </Text>
                          <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 13, marginTop: 2 }}>{formatINR(p.price)}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                      </Pressable>
                    ))}
                    {m.filters ? (
                      <Pressable
                        onPress={() => {
                          onClose();
                          router.push({ pathname: "/(tabs)/properties", params: { filters: encodeFilters(m.filters!) } });
                        }}
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.brandSoft }}
                      >
                        <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>View all in Properties</Text>
                        <Ionicons name="arrow-forward" size={15} color={colors.brand} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* quick-reply chips (e.g. profile intake) — only on the latest message */}
                {m.options?.length && i === msgs.length - 1 && !busy ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {m.options.map((o) => (
                      <Pressable
                        key={o.value}
                        onPress={() => send(o.label)}
                        style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brand }}
                      >
                        <Text style={{ color: colors.brand, fontWeight: "600", fontSize: 13 }}>{o.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
            {busy ? (
              <View style={{ alignSelf: "flex-start", padding: 10 }}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : null}
          </ScrollView>

          {/* input row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 12,
              paddingBottom: 28,
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderColor: colors.border,
            }}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask or command Jamindar…"
              placeholderTextColor={colors.inkFaint}
              style={{
                flex: 1,
                backgroundColor: colors.surfaceSunken,
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 15,
                color: colors.ink,
              }}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
            />
            {input.trim().length > 0 ? (
              <Pressable
                onPress={() => send(input)}
                style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                onPressIn={startVoice}
                onPressOut={stopVoice}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: recording ? colors.gold : colors.brand,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={recording ? "radio-button-on" : "mic"} size={22} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
