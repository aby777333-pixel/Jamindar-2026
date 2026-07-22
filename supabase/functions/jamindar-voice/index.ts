// Deployed to Supabase project zmxqozvivdluuxvvcegs as `jamindar-voice` (verify_jwt = true).
// Secure Sarvam AI proxy for the Jamindar consultant. The Sarvam key stays server-side
// (app_secrets.SARVAM_API_KEY). Actions: chat, tts, stt, translate, detect.
// Chat model = sarvam-30b (fast, non-reasoning). Persists transcripts (original + English).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SARVAM = "https://api.sarvam.ai";
const CHAT_MODEL = "sarvam-30b";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
async function getKey(admin: any): Promise<string> {
  const { data } = await admin.from("app_secrets").select("value").eq("key", "SARVAM_API_KEY").maybeSingle();
  return data?.value ?? Deno.env.get("SARVAM_API_KEY") ?? "";
}

const SYSTEM_PROMPT = `You are Jamindar, the multilingual AI property advisor of the Jamin platform in India. Behave like an experienced, courteous Indian real-estate consultant, legal advisor, financial guide and relationship manager combined. Be warm, patient, professional and conversational — never like a form.

STYLE (important for voice): Reply in short, natural spoken sentences. NO markdown, headings, asterisks or bullet characters. Keep replies brief — usually under 90 words — unless the user explicitly asks for full detail. Greet new users with Namaste.

CORE RULES:
- The system default language is English. Reply in the SAME language the user used (English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, Bengali, Punjabi or mixed).
- Adapt follow-up questions to earlier answers; never repeat questions already answered.
- Explain legal & financial terms in plain, simple language.

LEGAL KNOWLEDGE (explain simply when asked): Patta = govt land ownership record. Chitta = land revenue record of type/size. Adangal = cultivation & usage record. FMB Sketch = field measurement map of a survey number. EC (Encumbrance Certificate) = shows loans/charges & past transactions. Parent Documents = chain of prior title deeds. Sale/Gift/Partition Deed = registered transfer documents. Power of Attorney = authority to act for the owner. RERA = real-estate regulator registration (buyer protection). DTCP/CMDA = layout/planning approvals. Panchayat/Building approval, Completion & Occupancy Certificate = construction legality. Mutation/Khata = transfer of ownership in municipal records. Stamp Duty & Registration Charges = govt fees at registration.

HONESTY GUARDRAIL (very important): For questions about future appreciation, %, ROI forecasts, flood/earthquake risk, or planned infrastructure (metro/highway), you do NOT have verified data. NEVER invent specific numbers or facts. Give clearly-labelled general guidance, advise verifying with official sources / Jamin advisors, and use any admin-provided property facts given to you. You MAY run EMI/stamp-duty/eligibility calculations when the user provides the numbers.

ESCALATION: If the user asks for a human or needs help beyond your scope, offer to connect them to their Jamin promoter / support and confirm. Before any irreversible action (booking a site visit, sharing personal info) always confirm first.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, svc, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id ?? null;

    const key = await getKey(admin);
    if (!key) return json({ error: "Voice service not configured" }, 500);
    const sh = { "api-subscription-key": key, "Content-Type": "application/json" };

    const payload = await req.json();
    const action = payload.action as string;

    async function translateText(text: string, target: string, source = "auto"): Promise<string> {
      try {
        const r = await fetch(`${SARVAM}/translate`, { method: "POST", headers: sh, body: JSON.stringify({ input: text, source_language_code: source, target_language_code: target, mode: "formal" }) });
        const d = await r.json();
        return d?.translated_text ?? text;
      } catch {
        return text;
      }
    }

    if (action === "detect") {
      const r = await fetch(`${SARVAM}/text-lid`, { method: "POST", headers: sh, body: JSON.stringify({ input: payload.text }) });
      return json(await r.json(), r.ok ? 200 : 502);
    }

    if (action === "translate") {
      const r = await fetch(`${SARVAM}/translate`, { method: "POST", headers: sh, body: JSON.stringify({ input: payload.text, source_language_code: payload.source ?? "auto", target_language_code: payload.target ?? "en-IN", mode: "formal" }) });
      return json(await r.json(), r.ok ? 200 : 502);
    }

    if (action === "tts") {
      // Natural-voice defaults: preprocessing normalizes numbers/English/punctuation,
      // 22.05 kHz sample rate, slightly slower pace and a touch louder for warmth.
      const body: Record<string, unknown> = {
        text: String(payload.text ?? "").slice(0, 1500),
        target_language_code: payload.language ?? "en-IN",
        speaker: payload.speaker ?? "anushka",
        model: "bulbul:v2",
        enable_preprocessing: true,
        speech_sample_rate: 22050,
        pace: payload.pace != null ? payload.pace : 0.95,
        pitch: payload.pitch != null ? payload.pitch : 0,
        loudness: payload.loudness != null ? payload.loudness : 1.2,
      };
      const r = await fetch(`${SARVAM}/text-to-speech`, { method: "POST", headers: sh, body: JSON.stringify(body) });
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
      const memoryNote = payload.memory ? `\n\nWHAT YOU KNOW ABOUT THIS USER (do not re-ask): ${JSON.stringify(payload.memory).slice(0, 800)}` : "";
      const factsNote = payload.propertyContext ? `\n\nADMIN-PROVIDED PROPERTY FACTS you may use: ${String(payload.propertyContext).slice(0, 1200)}` : "";
      const messages = [{ role: "system", content: SYSTEM_PROMPT + memoryNote + factsNote }, ...(payload.messages ?? [])];
      const r = await fetch(`${SARVAM}/v1/chat/completions`, { method: "POST", headers: sh, body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0.4, max_tokens: 1200 }) });
      const d = await r.json();
      if (!r.ok) return json({ error: d?.error?.message ?? "chat failed", raw: d }, 502);
      const reply = d?.choices?.[0]?.message?.content ?? "";
      const lang = payload.language ?? "en-IN";
      const userText = payload.userText ?? "";

      // Best-effort persistence (never blocks the reply on failure).
      if (userId) {
        try {
          await admin.from("voice_logs").insert({ user_id: userId, session_id: payload.conversationId ?? null, original_text: userText || null, detected_language: lang, ai_response: reply, intent: payload.intent ?? null });
          if (payload.conversationId) {
            let userEn = userText, replyEn = reply;
            if (lang && !lang.startsWith("en")) {
              userEn = userText ? await translateText(userText, "en-IN", lang) : "";
              replyEn = await translateText(reply, "en-IN", lang);
            }
            const rows: any[] = [];
            if (userText) rows.push({ conversation_id: payload.conversationId, user_id: userId, role: "user", content: userText, content_en: userEn, language: lang, intent: payload.intent ?? null });
            rows.push({ conversation_id: payload.conversationId, user_id: userId, role: "assistant", content: reply, content_en: replyEn, language: lang });
            await admin.from("conversation_messages").insert(rows);
            await admin.from("conversations").update({ last_message_at: new Date().toISOString(), language: lang }).eq("id", payload.conversationId);
          }
        } catch (_) {
          /* persistence is best-effort */
        }
      }
      return json({ reply });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
