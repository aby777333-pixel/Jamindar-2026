// Deployed to Supabase project zmxqozvivdluuxvvcegs as `jamindar-voice` (verify_jwt = true).
// Secure Sarvam AI proxy for the Jamindar assistant. The Sarvam key stays server-side
// (app_secrets.SARVAM_API_KEY). Actions: chat, tts, stt, translate, detect.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SARVAM = "https://api.sarvam.ai";
const CHAT_MODEL = "sarvam-105b";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function getKey(admin: any): Promise<string> {
  const { data } = await admin.from("app_secrets").select("value").eq("key", "SARVAM_API_KEY").maybeSingle();
  return data?.value ?? Deno.env.get("SARVAM_API_KEY") ?? "";
}

const SYSTEM_PROMPT = `You are Jamindar, the warm, respectful voice assistant of the Jamin Properties app (real-estate: plots, villas, farm land, apartments across India). Greet with Namaste when a conversation starts. Be concise, friendly and helpful. Help users search properties, understand budgets, explain legal terms (DTCP, CMDA, RERA, patta, EC), and guide first-time buyers. Reply in the same language the user used. Never invent specific property listings; if asked to search, summarise the filters you understood and tell them you are opening the results.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, svc, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id ?? null;

    const key = await getKey(admin);
    if (!key) return json({ error: "Voice service not configured" }, 500);
    const sh = { "api-subscription-key": key, "Content-Type": "application/json" };

    const payload = await req.json();
    const action = payload.action as string;

    if (action === "detect") {
      const r = await fetch(`${SARVAM}/text-lid`, { method: "POST", headers: sh, body: JSON.stringify({ input: payload.text }) });
      return json(await r.json(), r.ok ? 200 : 502);
    }

    if (action === "translate") {
      const r = await fetch(`${SARVAM}/translate`, {
        method: "POST",
        headers: sh,
        body: JSON.stringify({
          input: payload.text,
          source_language_code: payload.source ?? "auto",
          target_language_code: payload.target ?? "en-IN",
          mode: "formal",
        }),
      });
      return json(await r.json(), r.ok ? 200 : 502);
    }

    if (action === "tts") {
      const r = await fetch(`${SARVAM}/text-to-speech`, {
        method: "POST",
        headers: sh,
        body: JSON.stringify({
          text: String(payload.text ?? "").slice(0, 1500),
          target_language_code: payload.language ?? "en-IN",
          speaker: payload.speaker ?? "anushka",
          model: "bulbul:v2",
        }),
      });
      return json(await r.json(), r.ok ? 200 : 502);
    }

    if (action === "stt") {
      const bin = Uint8Array.from(atob(payload.audioBase64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append("file", new Blob([bin], { type: payload.mime ?? "audio/wav" }), "audio.wav");
      form.append("model", "saarika:v2");
      const r = await fetch(`${SARVAM}/speech-to-text`, { method: "POST", headers: { "api-subscription-key": key }, body: form });
      return json(await r.json(), r.ok ? 200 : 502);
    }

    if (action === "chat") {
      const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...(payload.messages ?? [])];
      const r = await fetch(`${SARVAM}/v1/chat/completions`, {
        method: "POST",
        headers: sh,
        body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0.4, max_tokens: 400 }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: d?.error?.message ?? "chat failed", raw: d }, 502);
      const reply = d?.choices?.[0]?.message?.content ?? "";
      if (userId) {
        await admin.from("voice_logs").insert({
          user_id: userId,
          session_id: payload.sessionId ?? null,
          original_text: payload.userText ?? null,
          detected_language: payload.language ?? null,
          translated_text: payload.translated ?? null,
          ai_response: reply,
          intent: payload.intent ?? null,
        });
      }
      return json({ reply });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
