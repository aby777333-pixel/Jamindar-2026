import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  createAudioPlayer,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import { colors } from "@/lib/theme";
import {
  jamindarChat,
  synthesizeSpeech,
  transcribeSpeech,
  JAMINDAR_LANGUAGES,
  type ChatMsg,
} from "@/lib/jamindar";
import { Brandmark } from "./Brand";

/** Floating Jamindar assistant button + conversational sheet.
 *  Fully usable by touch; voice is additive. */
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
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState("en-IN");
  const [speak, setSpeak] = useState(true);
  const [recording, setRecording] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    if (visible && msgs.length === 0) {
      setMsgs([
        {
          role: "assistant",
          content:
            "Namaste 🙏 I'm Jamindar. Ask me about plots, budgets, locations or legal terms — by text or voice.",
        },
      ]);
    }
  }, [visible]);

  async function playReply(text: string) {
    if (!speak) return;
    try {
      const chunks = await synthesizeSpeech(text, language);
      for (const b64 of chunks) {
        const player = createAudioPlayer({ uri: `data:audio/wav;base64,${b64}` });
        player.play();
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch {
      /* voice optional — silent fallback */
    }
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setInput("");
    const next: ChatMsg[] = [...msgs, { role: "user", content: clean }];
    setMsgs(next);
    setBusy(true);
    try {
      const reply = await jamindarChat(next, { language });
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
      playReply(reply);
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: "Sorry, I couldn't reach the assistant. Please try again." },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
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
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
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
            height: "82%",
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
            <Pressable onPress={() => setSpeak((s) => !s)} style={{ padding: 6 }}>
              <Ionicons name={speak ? "volume-high" : "volume-mute"} size={22} color={colors.inkSoft} />
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
                onPress={() => setLanguage(l.code)}
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
                  maxWidth: "84%",
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
              placeholder="Ask Jamindar…"
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
