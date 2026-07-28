import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalize(m: string): string {
  const d = (m || '').replace(/[^0-9]/g, '');
  if (d.length === 10) return '91' + d;
  return d;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { mobile } = await req.json();
    if (!mobile) return json({ error: 'mobile required' }, 400);
    const norm = normalize(mobile);
    if (norm.length < 10) return json({ error: 'invalid mobile' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, svc);
    const pepper = Deno.env.get('OTP_PEPPER') ?? 'jamindar-pepper';

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin.from('otp_codes').select('id', { count: 'exact', head: true })
      .eq('mobile', norm).gte('created_at', since);
    if ((count ?? 0) >= 8) return json({ error: 'Too many attempts. Try again later.' }, 429);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256(code + pepper);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await admin.from('otp_codes').update({ consumed: true }).eq('mobile', norm).eq('consumed', false);
    const { error } = await admin.from('otp_codes').insert({ mobile: norm, code_hash, expires_at });
    if (error) return json({ error: error.message }, 500);

    let delivered = false;
    let channel = 'none';

    // Load every delivery credential in one round trip.
    const { data: secretRows } = await admin.from('app_secrets').select('key,value')
      .in('key', [
        'sms_endpoint', 'sms_api_key', 'sms_sender_id', 'sms_template',
        'wati_endpoint', 'wati_token', 'wati_template', 'wati_broadcast', 'wati_param',
      ]);
    const s: Record<string, string> = {};
    for (const r of secretRows ?? []) s[r.key] = r.value;

    // 1. SMS via MyDreams Technology (primary — DLT-registered sender JAMINP).
    //    The gateway expects a bare 10-digit Indian number, not the 91-prefixed
    //    form we store, and {#num#} is the DLT template's OTP placeholder.
    try {
      if (s.sms_endpoint && s.sms_api_key && s.sms_sender_id && s.sms_template) {
        const local = norm.replace(/^91/, '').slice(-10);
        const message = s.sms_template.replaceAll('{#num#}', code);
        const smsUrl =
          `${s.sms_endpoint}?apikey=${encodeURIComponent(s.sms_api_key)}` +
          `&senderid=${encodeURIComponent(s.sms_sender_id)}` +
          `&number=${encodeURIComponent(local)}` +
          `&message=${encodeURIComponent(message)}`;
        const r = await fetch(smsUrl, { method: 'GET' });
        const txt = (await r.text()).trim();
        // The gateway answers with plain text; treat explicit failure words as
        // failure so we still fall through to WhatsApp.
        const failed = /invalid|error|fail|insufficient|unauthori[sz]ed|blocked/i.test(txt);
        const ok = r.ok && !failed;
        if (ok) { delivered = true; channel = 'sms'; }
        console.log(`[JAMINDAR OTP] SMS ${local} http=${r.status} ok=${ok} body=${txt.slice(0, 300)}`);
      }
    } catch (e) {
      console.log('[JAMINDAR OTP] SMS error', String(e));
    }

    // 2. WhatsApp via WATI (fallback — kept exactly as before).
    try {
      if (!delivered && s.wati_endpoint && s.wati_token && s.wati_template) {
        const body = {
          template_name: s.wati_template,
          broadcast_name: s.wati_broadcast || 'otp_verify',
          receivers: [{ whatsappNumber: norm, customParams: [{ name: s.wati_param || '1', value: code }] }],
        };
        const r = await fetch(s.wati_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.wati_token}` },
          body: JSON.stringify(body),
        });
        const txt = await r.text();
        let ok = r.ok;
        try {
          const j = JSON.parse(txt);
          if (j && j.result === false) ok = false;
          if (Array.isArray(j?.errors?.invalidWhatsappNumbers) && j.errors.invalidWhatsappNumbers.length) ok = false;
        } catch (_) { /* non-JSON */ }
        delivered = ok;
        if (ok) channel = 'whatsapp';
        console.log(`[JAMINDAR OTP] WATI ${norm} http=${r.status} ok=${ok} body=${txt.slice(0, 300)}`);
      }
    } catch (e) {
      console.log('[JAMINDAR OTP] WATI error', String(e));
    }

    // MSG91 fallback.
    if (!delivered) {
      const msgAuth = Deno.env.get('MSG91_AUTHKEY');
      const msgTpl = Deno.env.get('MSG91_TEMPLATE_ID');
      if (msgAuth && msgTpl) {
        try {
          const r = await fetch('https://control.msg91.com/api/v5/otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authkey: msgAuth },
            body: JSON.stringify({ template_id: msgTpl, mobile: norm, otp: code }),
          });
          delivered = r.ok;
          if (r.ok) channel = 'msg91';
        } catch (_) { /* ignore */ }
      }
    }

    // ⚠️ PRE-LAUNCH ONLY: returning devCode lets ANYONE request an OTP for any
    // mobile number and read the code straight out of the API response, which is
    // an account-takeover path. It exists so the owner is not locked out while
    // delivery is being set up.
    //
    // Default is now 'off' (fail safe): if the app_secrets row is missing or
    // unreadable the code is NOT exposed. Turn it off for good with
    //   update app_secrets set value = 'off' where key = 'otp_expose_code';
    // once SMS delivery is confirmed working.
    let expose = false;
    try {
      const { data: ex } = await admin.from('app_secrets').select('value').eq('key', 'otp_expose_code').maybeSingle();
      expose = (ex?.value ?? 'off') === 'on';
    } catch (_) { expose = false; }
    const forceDev = Deno.env.get('OTP_DEV_MODE') === 'true';
    // First-time user? The verify screen only shows the referral-code field for
    // new registrations (bug report 28-07) — existing users go straight to OTP.
    let newUser = false;
    try {
      const { count: pc } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('mobile', norm);
      newUser = (pc ?? 0) === 0;
    } catch (_) { newUser = false; }
    const resp: Record<string, unknown> = { sent: true, mobile: norm, delivered, channel, newUser };
    if (forceDev || expose || !delivered) {
      resp.devCode = code;
      console.log(`[JAMINDAR OTP] ${norm} => ${code} (delivered=${delivered} channel=${channel})`);
    }
    return json(resp);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
