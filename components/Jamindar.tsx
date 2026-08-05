import { useCallback, useEffect, useRef, useState } from "react";
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
  Keyboard,
  Linking,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useAudioRecorder,
  createAudioPlayer,
  type AudioPlayer,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";
// SDK 56: readAsStringAsync/EncodingType only exist on the legacy entry — the
// main entry made every voice recording read throw (silently), so STT never ran.
import * as FileSystem from "expo-file-system/legacy";
import { colors, space } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { useAuth, useEffectiveRole } from "@/lib/store";
import {
  jamindarChatEx,
  synthesizeSpeech,
  transcribeSpeech,
  loadMemory,
  saveMemory,
  getOrCreateConversation,
  loadConversationMessages,
  translate,
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
import { fetchLiveInventory, rankAlternatives, matchMentionedProjects, phaseLabel } from "@/lib/jamindar-sales";
import { openChannel, type ResolvedContact } from "@/lib/comms";
import type { Property } from "@/lib/types";
import { JamindarFace } from "./Brand";

type UIMsg = ChatMsg & {
  results?: Property[];
  filters?: SearchFilters;
  options?: { label: string; value: string }[];
  /** Rich sales-consultant cards — always real, live projects (never fabricated). */
  recommendations?: Property[];
};

// Guided profile intake — Jamindar asks these once and remembers the answers.
type IntakeStep = {
  field: string;
  q: string;
  options?: { label: string; value: string }[];
  parse: (raw: string) => unknown;
};
const YES = /\b(yes|yeah|yep|first|new|haan|ஆம்|हाँ)\b/i;

// Jamindar now hands out the branded /s/<id> share page when someone asks for
// photos, a brochure or a map. In a plain <Text> that arrives as dead text the
// buyer would have to retype, so the reply body is split on URLs and each one
// rendered as a tappable span. Trailing sentence punctuation is left outside
// the link — "…/s/abc." must not open ".../s/abc%2E".
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
function withLinks(text: string, color: string, linkColor: string) {
  const parts = String(text ?? "").split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text
        key={i}
        style={{ color: linkColor, textDecorationLine: "underline" }}
        onPress={() => Linking.openURL(part).catch(() => {})}
      >
        {part}
      </Text>
    ) : (
      <Text key={i} style={{ color }}>
        {part}
      </Text>
    ),
  );
}
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

/**
 * "Reopen me when the user comes back."
 *
 * Bug report 18: asking Jamindar to open the Legal Guide navigated there and
 * left the chat behind — Back returned to the host screen with the sheet shut.
 * The sheet cannot stay open across a push (a Modal covers the new screen), so
 * instead it records that it closed itself to navigate, and each host clears
 * the flag on regaining focus and reopens.
 *
 * The conversation itself is already safe: it is persisted per user and
 * reloaded when the sheet opens, so reopening restores what was said.
 *
 * Read-once on purpose — a stale flag must never reopen the sheet twice.
 */
let resumeRequested = false;
export function requestResume() {
  resumeRequested = true;
}
export function consumeResume(): boolean {
  const wanted = resumeRequested;
  resumeRequested = false;
  return wanted;
}

/** Floating Jamindar assistant button + conversational sheet.
 *  Fully usable by touch; voice is additive. Drop it on any screen.
 *
 *  `bottomOffset` is the height of whatever already sits at the bottom of the
 *  host screen (tab bar, action bar). The system navigation inset is added on
 *  top of it here, so the button can never sit under the navigation bar. */
export function JamindarFab({ bottomOffset = 24 }: { bottomOffset?: number } = {}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // Coming back from somewhere Jamindar sent us? Put the chat back up.
  useFocusEffect(
    useCallback(() => {
      if (consumeResume()) setOpen(true);
    }, []),
  );

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
          bottom: Math.max(insets.bottom, 8) + bottomOffset,
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
  const [speaking, setSpeaking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Gesture-race guards: a quick tap fires pressOut while startVoice is still
  // awaiting (permission / prepare), which used to stop before the recording
  // began and leave the button stuck on "recording".
  const startingRef = useRef<Promise<boolean> | null>(null);
  const recordingRef = useRef(false);
  // Live sellable inventory — powers the sales-consultant cards. Refreshed on
  // every open so an unavailable project is never recommended again.
  const inventoryRef = useRef<Property[]>([]);
  const recStartRef = useRef(0);
  const pressStoppedRef = useRef(false);
  // language for in-flight async work (state reads inside closures go stale
  // for the very turn where STT auto-detects a new language)
  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [kb, setKb] = useState(0);

  // A RN Modal window does not reliably inherit adjustResize, so the keyboard
  // would sit on top of the input row. Track its real height and lift the
  // sheet by exactly that much, shrinking it so the top stays on screen.
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKb(e.endCoordinates?.height ?? 0);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const sheetH = Math.max(260, Math.min(screenH * 0.85, screenH - kb - 24));

  // Load memory, voice prefs and resume the last conversation on open.
  useEffect(() => {
    if (!visible || !profile?.id) return;
    let cancelled = false;
    fetchLiveInventory().then((inv) => {
      if (!cancelled) inventoryRef.current = inv;
    }).catch(() => {});
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
    // Bug report #11: remove() alone does NOT halt audio already playing on
    // device — pause first, then release.
    try {
      playerRef.current?.pause();
    } catch {
      /* ignore */
    }
    try {
      playerRef.current?.remove();
    } catch {
      /* ignore */
    }
    playerRef.current = null;
    setSpeaking(false);
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
      const chunks = await synthesizeSpeech(text, languageRef.current, { speaker: prefs.speaker, pace: prefs.pace });
      if (speakSeq.current !== mySeq || chunks.length === 0) return; // interrupted meanwhile
      setSpeaking(true);
      for (let i = 0; i < chunks.length; i++) {
        if (speakSeq.current !== mySeq) return; // interrupted
        await playChunkToEnd(`data:audio/wav;base64,${chunks[i]}`);
      }
    } catch {
      /* voice optional — silent fallback */
    } finally {
      if (speakSeq.current === mySeq) setSpeaking(false);
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
        // Intelligent cross-sell (owner spec 28-07): never end at "no results".
        // Acknowledge honestly, then present the closest LIVE alternatives.
        const pool = inventoryRef.current.length ? inventoryRef.current : await fetchLiveInventory().catch(() => [] as Property[]);
        const alts = rankAlternatives(pool, filters).slice(0, 3);
        if (alts.length > 0) {
          let msg =
            `I couldn't find an exact match for ${desc} right now — the moment matching inventory arrives I'll help you find it. ` +
            `Meanwhile, here are live Jamin opportunities closest to what you're looking for. ` +
            `Are you buying for investment or self-use?`;
          if (!languageRef.current.startsWith("en")) {
            msg = await translate(msg, languageRef.current).catch(() => msg);
          }
          pushAssistant(msg, true, { recommendations: alts });
        } else {
          pushAssistant(`I couldn't find ${desc} right now. Try widening the budget or location, and I'll look again.`);
        }
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
        // Bug report 18: the sheet has to close before pushing — a Modal
        // renders above every screen, so leaving it open would hide whatever
        // we navigated to. Closing it, though, meant Back returned to a screen
        // with no chat on it and the conversation looked lost. Flag the close
        // as "I am coming back", and the host reopens the sheet on return.
        requestResume();
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
    if (intent.action === "escalate") {
      pushAssistant(intent.say, prefs.spokenConfirm);
      Alert.alert("Connect to an advisor", "Shall I ask a Jamin property advisor to call you?", [
        { text: "Not now", style: "cancel" },
        {
          text: "Yes, connect me",
          onPress: async () => {
            if (!profile?.id) return;
            try {
              await supabase
                .from("leads")
                .insert({ buyer_id: profile.id, promoter_id: profile.assigned_promoter ?? null, source: "jamindar_escalation", status: "new" });
            } catch {
              /* best-effort */
            }
            pushAssistant("Done 🙏 A Jamin advisor will reach out to you shortly. Is there anything else I can help with meanwhile?");
          },
        },
      ]);
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
      // The memory blob is loaded once on open — override its language with the
      // live chip so a stale stored preference can't contradict the selection
      // in the system prompt (bug 28-07: chip ignored, replies stayed Telugu).
      const mem = memory ? { ...memory, language: languageRef.current } : memory;
      const res = await jamindarChatEx(history, { language: languageRef.current, conversationId, memory: mem });
      const reply = res.reply;
      // Sales module: when the reply names live projects (the brain only knows
      // real inventory), attach rich tappable cards under the bubble. The
      // server sends ids matched pre-translation (works in every language);
      // client-side text matching stays as the fallback.
      const pool = inventoryRef.current;
      let recs = res.mentioned?.length ? pool.filter((p) => res.mentioned!.includes(p.id)) : [];
      if (recs.length === 0) recs = matchMentionedProjects(reply, pool);
      pushAssistant(reply, true, recs.length ? { recommendations: recs.slice(0, 3) } : undefined);
    } catch {
      pushAssistant("Sorry, I couldn't reach the assistant just now. Please try again.", false);
    } finally {
      setBusy(false);
    }
  }

  async function startVoice() {
    if (startingRef.current || recordingRef.current) return;
    recStartRef.current = Date.now();
    const p = (async () => {
      try {
        stopSpeaking(); // tapping the mic always interrupts Jamindar's voice
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Microphone needed",
            "Please allow microphone access so Jamindar can hear you. Enable it under Settings → Apps → Jamin → Permissions and try again."
          );
          return false;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        recStartRef.current = Date.now();
        recordingRef.current = true;
        setRecording(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        return true;
      } catch {
        recordingRef.current = false;
        setRecording(false);
        return false;
      }
    })();
    startingRef.current = p;
    try {
      await p;
    } finally {
      startingRef.current = null;
    }
  }

  async function stopVoice() {
    // Never stop mid-start: wait for the in-flight start (incl. the permission
    // dialog) so a quick tap can't kill the recorder before it began.
    const starting = startingRef.current;
    if (starting) {
      const ok = await starting;
      if (!ok) return;
    }
    if (!recordingRef.current) return;
    // give the recorder a beat so ultra-short taps still carry audio
    const elapsed = Date.now() - recStartRef.current;
    if (elapsed < 400) await new Promise((r) => setTimeout(r, 400 - elapsed));
    recordingRef.current = false;
    setRecording(false);
    setBusy(true);
    try {
      await recorder.stop();
      // leave recording mode so replies play loud through the speaker
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) {
        pushAssistant("I couldn't capture any audio. Tap the mic and try again.", false);
        return;
      }
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      // expo-audio records AAC in an MP4 container — label it correctly for Sarvam
      const { transcript, language: detected } = await transcribeSpeech(b64, "audio/mp4");
      const heard = transcript.trim();
      if (!heard) {
        pushAssistant("Sorry, I didn't catch that. Tap the mic and speak again — a little closer to the phone helps.", false);
        return;
      }
      // the detected spoken language wins for this turn (chip updates too)
      if (detected && JAMINDAR_LANGUAGES.some((l) => l.code === detected)) {
        languageRef.current = detected;
        setLanguage(detected);
      }
      await send(heard);
    } catch {
      pushAssistant("Sorry, I couldn't process that recording. Please try again.", false);
    } finally {
      setBusy(false);
    }
  }

  // Press-in starts listening. A quick tap keeps listening (tap again to send);
  // a long hold works walkie-talkie style — release sends.
  // Bug report #10: while Jamindar is SPEAKING, the mic acts as an instant STOP
  // — playback halts and voice mode turns off (no recording starts). Speaking
  // to the mic again naturally re-enables voice replies.
  function onMicPressIn() {
    if (busy) return;
    if (speaking && !recordingRef.current && !startingRef.current) {
      pressStoppedRef.current = true; // consume this press entirely
      stopSpeaking();
      if (prefs.readAloud) setPrefs((p) => ({ ...p, readAloud: false }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return;
    }
    if (recordingRef.current || startingRef.current) {
      pressStoppedRef.current = true; // this press is the "stop" tap
      void stopVoice();
    } else {
      pressStoppedRef.current = false;
      // starting a voice question implies wanting a voice answer
      if (!prefs.readAloud) setPrefs((p) => ({ ...p, readAloud: true }));
      void startVoice();
    }
  }
  function onMicPressOut() {
    if (pressStoppedRef.current) {
      pressStoppedRef.current = false;
      return;
    }
    if (Date.now() - recStartRef.current >= 600) void stopVoice();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surfaceAlt,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            height: sheetH,
            marginBottom: kb,
            paddingTop: 14,
          }}
        >
          {/* header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 10 }}>
            <JamindarFace size={space.lg + space.xs} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "800", fontSize: 17, color: colors.ink }}>Jamindar</Text>
              <Text style={{ color: colors.inkFaint, fontSize: 12 }}>Your voice property guide</Text>
            </View>
            <Pressable onPress={() => router.push("/jamindar/settings")} style={{ padding: 6 }}>
              <Ionicons name="options" size={20} color={colors.inkSoft} />
            </Pressable>
            <Pressable
              onPress={() => {
                if (prefs.readAloud) stopSpeaking(); // turning voice off silences the current reply instantly (bug report #9)
                setPrefs((p) => ({ ...p, readAloud: !p.readAloud }));
              }}
              style={{ padding: 6 }}
            >
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
            keyboardShouldPersistTaps="handled"
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
                    {withLinks(
                      m.content,
                      m.role === "user" ? "#fff" : colors.ink,
                      m.role === "user" ? "#fff" : colors.brand,
                    )}
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
                          router.navigate({ pathname: "/(tabs)/properties", params: { filters: encodeFilters(m.filters!) } });
                        }}
                        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.brandSoft }}
                      >
                        <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>View all in Properties</Text>
                        <Ionicons name="arrow-forward" size={15} color={colors.brand} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* sales-consultant cards — real live projects the reply mentioned */}
                {m.recommendations?.length ? (
                  <View style={{ gap: 10 }}>
                    {m.recommendations.map((p) => (
                      <RecommendationCard
                        key={p.id}
                        property={p}
                        onOpen={() => {
                          onClose();
                          router.push(`/property/${p.id}`);
                        }}
                      />
                    ))}
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

          {/* voice status strip — Listening / Processing / Speaking */}
          {recording || busy || speaking ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 18,
                paddingVertical: 7,
                backgroundColor: colors.surface,
                borderTopWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: recording ? colors.gold : busy ? colors.brand : "#0C8046",
                }}
              />
              <Text style={{ color: colors.inkSoft, fontSize: 12.5, fontWeight: "600" }}>
                {recording
                  ? "Listening… tap the mic again when you're done"
                  : busy
                    ? "Processing…"
                    : "Speaking — tap the mic to interrupt"}
              </Text>
            </View>
          ) : null}

          {/* input row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 12,
              paddingBottom: kb > 0 ? 12 : Math.max(insets.bottom, 12) + 8,
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
                onPressIn={onMicPressIn}
                onPressOut={onMicPressOut}
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

/** Resolve who this user may contact for a property (Jamin routing rules) and
 *  open the channel natively. Best-effort; the attempt is logged server-side. */
async function contactForProperty(p: Property, channel: "whatsapp_message" | "phone") {
  try {
    const { data } = await supabase.rpc("resolve_contact", { p_property_id: p.id, p_counterpart: null });
    const c = data as ResolvedContact | null;
    if (!c) return;
    await openChannel(channel, c, {
      propertyId: p.id,
      message: `Hi, I'm interested in ${p.title} (via Jamindar).`,
    });
  } catch {
    /* contact is best-effort — never crash the chat */
  }
}

/** Rich sales card shown under an assistant reply — always a real live project
 *  (photo, price, status) with honest actions: view, brochure, WhatsApp, call. */
function RecommendationCard({ property: p, onOpen }: { property: Property; onOpen: () => void }) {
  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: "open-outline", label: "View & book visit", onPress: onOpen },
  ];
  if (p.brochure_url) {
    actions.push({ icon: "document-text-outline", label: "Brochure", onPress: () => Linking.openURL(p.brochure_url!).catch(() => {}) });
  }
  actions.push({ icon: "logo-whatsapp", label: "WhatsApp", onPress: () => contactForProperty(p, "whatsapp_message") });
  actions.push({ icon: "call-outline", label: "Call", onPress: () => contactForProperty(p, "phone") });

  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: "hidden" }}>
      <Pressable onPress={onOpen}>
        {p.images?.[0] ? (
          <View>
            <Image source={{ uri: p.images[0] }} style={{ width: "100%", height: 120 }} />
            <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: "rgba(255,255,255,0.93)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.ink }}>{phaseLabel(p)}</Text>
            </View>
          </View>
        ) : null}
        <View style={{ padding: 12 }}>
          <Text style={{ fontWeight: "800", color: colors.ink, fontSize: 15 }} numberOfLines={1}>{p.title}</Text>
          <Text style={{ color: colors.inkFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {[p.locality, p.city, p.district].filter(Boolean).join(", ")}
          </Text>
          <Text style={{ color: colors.brand, fontWeight: "800", fontSize: 14, marginTop: 4 }}>
            {p.price ? formatINR(p.price) : "Price on request"}
          </Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Ionicons name={a.icon} size={14} color={colors.brand} />
            <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 12 }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
