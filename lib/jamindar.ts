import { supabase } from "./supabase";

export type ChatMsg = { role: "user" | "assistant"; content: string };

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
  opts: { language?: string; sessionId?: string; intent?: string } = {}
): Promise<string> {
  const userText = [...messages].reverse().find((m) => m.role === "user")?.content;
  const res = await invoke<{ reply: string }>({
    action: "chat",
    messages,
    userText,
    language: opts.language ?? "en-IN",
    sessionId: opts.sessionId,
    intent: opts.intent,
  });
  return res.reply;
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
  speaker = "anushka"
): Promise<string[]> {
  const res = await invoke<{ audios?: string[] }>({
    action: "tts",
    text,
    language,
    speaker,
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
