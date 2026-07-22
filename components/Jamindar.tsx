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
import { useAuth, useEffectiveRole } from "@/lib/store";
import {
  jamindarChat,
  synthesizeSpeech,
  transcribeSpeech,
  loadMemory,
  getOrCreateConversation,
  loadConversationMessages,
  JAMINDAR_LANGUAGES,
  DEFAULT_VOICE_PREFS,
  type VoicePrefs,
  type JamindarMemory,
  type ChatMsg,
} from "@/lib/jamindar";
import { parseIntent } from "@/lib/jamindar-intents";
import { Brandmark } from "./Brand";

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
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
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
      setMsgs([
        {
          role: "assistant",
          content: `Namaste${name} 🙏 I'm Jamindar, your property advisor. Ask me about plots, budgets, legal terms, or say "open properties", "book a site visit" — by voice or text.`,
        },
      ]);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, profile?.id]);

  function stopSpeaking() {
    try {
      playerRef.current?.remove();
    } catch {
      /* ignore */
    }
    playerRef.current = null;
  }

  async function playReply(text: string) {
    if (!prefs.readAloud) return;
    try {
      const chunks = await synthesizeSpeech(text, language, { speaker: prefs.speaker, pace: prefs.pace });
      for (const b64 of chunks) {
        stopSpeaking();
        const player = createAudioPlayer({ uri: `data:audio/wav;base64,${b64}` });
        playerRef.current = player;
        player.play();
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch {
      /* voice optional — silent fallback */
    }
  }

  function pushAssistant(content: string, speak = true) {
    setMsgs((m) => [...m, { role: "assistant", content }]);
    if (speak) playReply(content);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
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

    // 1) voice-navigation / command layer
    const handled = await handleIntent(clean);
    if (handled) return;

    // 2) consultant brain
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
              <View
                key={i}
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
