import * as FileSystem from "expo-file-system/legacy";
import { setAudioModeAsync } from "expo-audio";

/**
 * Playback helpers for Jamindar's spoken replies and the "Listen" buttons.
 *
 * Sarvam returns text-to-speech as base64 WAV. The app used to hand
 * `data:audio/wav;base64,…` straight to expo-audio, which works in a few
 * environments and silently fails on many Android devices (the player rejects
 * long data: URIs) — which is what testers saw as "the voice is not working"
 * (report 2026-11 #3, #4). A real file in the cache directory is the
 * form every player supports, so each chunk is written out first and the data
 * URI is only the last-resort fallback if the write itself fails.
 */

let counter = 0;

/** Write one base64 WAV chunk to the cache and return a playable URI. */
export async function wavToUri(base64: string): Promise<string> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) throw new Error("no cache dir");
    const uri = `${dir}jamindar-tts-${Date.now()}-${counter++}.wav`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  } catch {
    return `data:audio/wav;base64,${base64}`;
  }
}

/** Delete a chunk written by wavToUri (no-op for data: URIs). */
export function dropAudioFile(uri: string): void {
  if (!uri.startsWith("file")) return;
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/**
 * Put the audio session into playback mode. After the microphone has been used
 * the session can stay in recording mode, which on Android routes sound to the
 * earpiece at a whisper (or nowhere) and on iOS mutes it with the ringer off.
 */
export async function preparePlayback(): Promise<void> {
  try {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  } catch {
    /* best-effort — playback is attempted regardless */
  }
}
