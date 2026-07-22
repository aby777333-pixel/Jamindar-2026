import { supabase } from "./supabase";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface VoicePrefs {
  speaker: string; // Sarvam speaker (e.g. "anushka" female, "abhilash" male)
  gender: "female" | "male";
  pace: number; // 0.5–1.5
  style: "friendly" | "formal";
  readAloud: boolean; // auto-speak replies
  spokenConfirm: boolean;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  speaker: "anushka",
  gender: "female",
  pace: 1.0,
  style: "friendly",
  readAloud: true,
  spokenConfirm: true,
};

export const SPEAKERS = {
  female: [
    { id: "anushka", label: "Anushka" },
    { id: "manisha", label: "Manisha" },
    { id: "vidya", label: "Vidya" },
  ],
  male: [
    { id: "abhilash", label: "Abhilash" },
    { id: "karun", label: "Karun" },
    { id: "hitesh", label: "Hitesh" },
  ],
} as const;

export interface JamindarMemory {
  user_id?: string;
  call_name?: string | null;
  language?: string | null;
  is_first_time_buyer?: boolean | null;
  residency?: string | null;
  occupation?: string | null;
  prefs?: Record<string, unknown>;
  voice_prefs?: Partial<VoicePrefs>;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("jamindar-voice", {
    body,
  });
  if (error) throw new Error(error.message);
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Multi-turn conversation with Jamindar. Transcripts are logged server-side. */
export async function jamindarChat(
  messages: ChatMsg[],
  opts: {
    language?: string;
    conversationId?: string;
    intent?: string;
    memory?: JamindarMemory | null;
    propertyContext?: string;
  } = {}
): Promise<string> {
  const userText = [...messages].reverse().find((m) => m.role === "user")?.content;
  const res = await invoke<{ reply: string }>({
    action: "chat",
    messages,
    userText,
    language: opts.language ?? "en-IN",
    conversationId: opts.conversationId,
    intent: opts.intent,
    memory: opts.memory ?? undefined,
    propertyContext: opts.propertyContext,
  });
  return res.reply;
}

// ---------- memory ----------
export async function loadMemory(userId: string): Promise<JamindarMemory | null> {
  const { data } = await supabase.from("jamindar_memory").select("*").eq("user_id", userId).maybeSingle();
  return (data as JamindarMemory) ?? null;
}

export async function saveMemory(userId: string, patch: Partial<JamindarMemory>): Promise<void> {
  await supabase.from("jamindar_memory").upsert(
    { user_id: userId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

export async function saveVoicePrefs(userId: string, prefs: VoicePrefs): Promise<void> {
  await saveMemory(userId, { voice_prefs: prefs });
}

// ---------- conversation resume ----------
export async function getOrCreateConversation(userId: string, language: string): Promise<string> {
  const { data: recent } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // resume a conversation touched within the last 12 hours, else start fresh
  if (recent && Date.now() - new Date(recent.last_message_at).getTime() < 12 * 3600 * 1000) {
    return recent.id as string;
  }
  const { data: created } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: "Jamindar chat", language })
    .select("id")
    .single();
  return (created as { id: string }).id;
}

export async function loadConversationMessages(conversationId: string): Promise<ChatMsg[]> {
  const { data } = await supabase
    .from("conversation_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);
  return (data as ChatMsg[]) ?? [];
}

/** Detect the language of a piece of text (returns a Sarvam language_code like "ta-IN"). */
export async function detectLanguage(text: string): Promise<string> {
  try {
    const res = await invoke<{ language_code?: string }>({ action: "detect", text });
    return res.language_code ?? "en-IN";
  } catch {
    return "en-IN";
  }
}

/** Translate text between languages. */
export async function translate(
  text: string,
  target: string,
  source = "auto"
): Promise<string> {
  const res = await invoke<{ translated_text?: string }>({
    action: "translate",
    text,
    target,
    source,
  });
  return res.translated_text ?? text;
}

/** Text-to-speech. Returns base64 WAV chunks from Sarvam bulbul. */
export async function synthesizeSpeech(
  text: string,
  language = "en-IN",
  opts: { speaker?: string; pace?: number } = {}
): Promise<string[]> {
  const res = await invoke<{ audios?: string[] }>({
    action: "tts",
    text,
    language,
    speaker: opts.speaker ?? "anushka",
    pace: opts.pace,
  });
  return res.audios ?? [];
}

/** Speech-to-text from base64 audio. Returns transcript + detected language. */
export async function transcribeSpeech(
  audioBase64: string,
  mime = "audio/wav"
): Promise<{ transcript: string; language: string }> {
  const res = await invoke<{ transcript?: string; language_code?: string }>({
    action: "stt",
    audioBase64,
    mime,
  });
  return { transcript: res.transcript ?? "", language: res.language_code ?? "en-IN" };
}

// Supported languages for Jamindar (Sarvam codes).
export const JAMINDAR_LANGUAGES: { code: string; label: string }[] = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
  { code: "ml-IN", label: "മലയാളം" },
  { code: "mr-IN", label: "मराठी" },
  { code: "gu-IN", label: "ગુજરાતી" },
  { code: "bn-IN", label: "বাংলা" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ" },
];
