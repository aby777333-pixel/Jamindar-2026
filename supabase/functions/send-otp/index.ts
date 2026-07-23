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

    // WhatsApp via WATI (config in app_secrets).
    try {
      const { data: rows } = await admin.from('app_secrets').select('key,value')
        .in('key', ['wati_endpoint', 'wati_token', 'wati_template', 'wati_broadcast', 'wati_param']);
      const s: Record<string, string> = {};
      for (const r of rows ?? []) s[r.key] = r.value;
      if (s.wati_endpoint && s.wati_token && s.wati_template) {
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
        } catch (_) { /* ignore */ }
      }
    }

    // TEMPORARY (pre-launch): also return devCode so the owner/testers can sign in
    // even while WhatsApp delivery is limited to opted-in numbers. Gated by
    // app_secrets.otp_expose_code = 'on' so it can be flipped OFF without a
    // redeploy. REMOVE / set to 'off' before public launch.
    let expose = false;
    try {
      const { data: ex } = await admin.from('app_secrets').select('value').eq('key', 'otp_expose_code').maybeSingle();
      expose = (ex?.value ?? 'on') === 'on';
    } catch (_) { expose = true; }
    const forceDev = Deno.env.get('OTP_DEV_MODE') === 'true';
    const resp: Record<string, unknown> = { sent: true, mobile: norm, delivered };
    if (forceDev || expose || !delivered) {
      resp.devCode = code;
      console.log(`[JAMINDAR OTP] ${norm} => ${code} (delivered=${delivered})`);
    }
    return json(resp);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
