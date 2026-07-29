// Jamindar — branded share page Edge Function (0053).
// GET  /share/<propertyId>?ref=<code>[&lang=ta] → premium server-rendered page with
//      full Open Graph/Twitter meta (rich previews on WhatsApp/Telegram/FB/X/iMessage),
//      project hero, promoter card + verified badge, CTAs and a QR code.
// POST /share/<propertyId> {action:'lead', ...} → attributed lead / site-visit request.
// Served on the branded domain via Netlify proxy: /s/* → this function.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import QRCode from 'npm:qrcode@1.5.3';

const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const T: Record<string, Record<string, string>> = {
  en: {
    view: 'View Project', brochure: 'Download Brochure', call: 'Call', whatsapp: 'WhatsApp',
    visit: 'Book Site Visit', enquire: 'Send Enquiry', name: 'Your name', mobile: '10-digit mobile',
    message: 'Message (optional)', send: 'Submit', sent: 'Thank you! We will contact you shortly.',
    scan: 'Scan to open this page', partner: 'Your Personal Property Partner', plots: 'plots',
    available: 'available', phase_future: 'Upcoming Project', phase_ongoing: 'Ongoing Project',
    phase_current: 'Current Project', phase_completed: 'Completed Project',
  },
  ta: {
    view: 'திட்டத்தைப் பார்க்க', brochure: 'விவரக்கையேடு பதிவிறக்க', call: 'அழைக்க', whatsapp: 'வாட்ஸ்அப்',
    visit: 'நேரில் பார்வையிட முன்பதிவு', enquire: 'விசாரணை அனுப்ப', name: 'உங்கள் பெயர்', mobile: '10 இலக்க மொபைல்',
    message: 'செய்தி (விருப்பம்)', send: 'சமர்ப்பிக்க', sent: 'நன்றி! விரைவில் உங்களை தொடர்பு கொள்வோம்.',
    scan: 'இந்தப் பக்கத்தை திறக்க ஸ்கேன் செய்யவும்', partner: 'உங்கள் சொந்த சொத்து பங்குதாரர்', plots: 'மனைகள்',
    available: 'கிடைக்கின்றன', phase_future: 'வரவிருக்கும் திட்டம்', phase_ongoing: 'நடைபெறும் திட்டம்',
    phase_current: 'தற்போதைய திட்டம்', phase_completed: 'நிறைவடைந்த திட்டம்',
  },
  hi: {
    view: 'प्रोजेक्ट देखें', brochure: 'ब्रोशर डाउनलोड करें', call: 'कॉल करें', whatsapp: 'व्हाट्सऐप',
    visit: 'साइट विज़िट बुक करें', enquire: 'पूछताछ भेजें', name: 'आपका नाम', mobile: '10 अंकों का मोबाइल',
    message: 'संदेश (वैकल्पिक)', send: 'भेजें', sent: 'धन्यवाद! हम शीघ्र संपर्क करेंगे।',
    scan: 'यह पेज खोलने के लिए स्कैन करें', partner: 'आपके निजी प्रॉपर्टी पार्टनर', plots: 'प्लॉट',
    available: 'उपलब्ध', phase_future: 'आगामी प्रोजेक्ट', phase_ongoing: 'चालू प्रोजेक्ट',
    phase_current: 'वर्तमान प्रोजेक्ट', phase_completed: 'पूर्ण प्रोजेक्ट',
  },
};

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function digitsWa(s: string): string {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  return d;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const propertyId = parts[parts.length - 1];
    if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return new Response('Not found', { status: 404 });

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { data } = await svc.rpc('share_capture_lead', {
        p_ref: String(body.ref ?? ''), p_property: propertyId,
        p_name: String(body.name ?? ''), p_mobile: String(body.mobile ?? ''),
        p_message: String(body.message ?? ''), p_intent: body.intent === 'site_visit' ? 'site_visit' : 'enquiry',
      });
      return new Response(JSON.stringify(data ?? { ok: false }), { headers: { 'Content-Type': 'application/json' } });
    }

    const ref = (url.searchParams.get('ref') ?? '').trim();
    const lang = ['ta', 'hi'].includes(url.searchParams.get('lang') ?? '') ? url.searchParams.get('lang')! : 'en';
    const t = T[lang];

    const { data } = await svc.rpc('share_page_data', { p_property: propertyId, p_ref: ref || null });
    const d = data as any;
    if (!d?.ok) return new Response('Not found', { status: 404 });
    const p = d.property, pr = d.promoter, cfg = d.config ?? {};
    const brand = cfg.brand_name ?? 'Jamin Properties';
    const siteBase = cfg.site_base ?? 'https://merry-begonia-4c3cd1.netlify.app';
    const badge = cfg.badge_label ?? 'Verified Jamin Bazaar Partner';
    const refCode = pr?.referral_code ?? ref;
    const canonical = `${siteBase}/s/${p.id}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`;
    const hero = Array.isArray(p.images) && p.images.length ? String(p.images[0]) : `${siteBase}/jamindar.jpg`;
    const desc = (lang !== 'en' && p.translations?.[lang]?.description) || p.description ||
      `${p.title} — premium plotted development by ${brand}.`;
    const shortDesc = String(desc).replace(/\s+/g, ' ').slice(0, 200);
    const loc = [p.city, p.district, p.state].filter(Boolean).join(', ');
    const phaseLabel = t[`phase_${p.project_phase}`] ?? '';
    const brochureHref = `${siteBase}/b/${p.id}?ref=${encodeURIComponent(refCode || '')}&src=sharepage`;
    const wa = pr ? digitsWa(pr.whatsapp || pr.mobile || '') : '';
    const waText = encodeURIComponent(`Hi${pr ? ' ' + pr.name : ''}, I'm interested in ${p.title}${refCode ? ` (Ref: ${refCode})` : ''}`);
    const qrSvg = await QRCode.toString(canonical, { type: 'svg', margin: 1, width: 132, color: { dark: '#1c1c20', light: '#ffffff' } });

    // log the view as an attributed click (server-side, crawler + human alike)
    if (ref) svc.rpc('log_share_event', { p_ref: ref, p_property: p.id, p_event: 'click', p_channel: 'share_page' }).then(() => {});

    const promoterCard = pr ? `
      <div class="pcard">
        <div class="prow">
          ${pr.avatar_url ? `<img class="pavatar" src="${esc(pr.avatar_url)}" alt="${esc(pr.name)}">` : `<div class="pavatar pinit">${esc(String(pr.name ?? 'J').charAt(0))}</div>`}
          <div>
            <div class="plabel">${esc(t.partner)}</div>
            <div class="pname">${esc(pr.name)}</div>
            ${pr.verified ? `<div class="badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>${esc(badge)}</div>` : ''}
            <div class="pid">${esc(pr.partner_code ?? pr.referral_code ?? '')}</div>
          </div>
        </div>
        <div class="pactions">
          ${pr.mobile ? `<a class="chip" href="tel:${esc(pr.mobile)}">📞 ${esc(t.call)}</a>` : ''}
          ${wa ? `<a class="chip wa" href="https://wa.me/${wa}?text=${waText}">🟢 ${esc(t.whatsapp)}</a>` : ''}
          ${pr.email ? `<a class="chip" href="mailto:${esc(pr.email)}">✉️ Email</a>` : ''}
          <a class="chip" href="${esc(siteBase)}/card?c=${encodeURIComponent(pr.partner_code ?? pr.referral_code ?? '')}">💳 V-Card</a>
        </div>
      </div>` : '';

    const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} — ${esc(brand)}</title>
<meta name="description" content="${esc(shortDesc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(brand)}">
<meta property="og:title" content="${esc(p.title)}${loc ? ' · ' + esc(loc) : ''}">
<meta property="og:description" content="${esc(shortDesc)}">
<meta property="og:image" content="${esc(hero)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(shortDesc)}">
<meta name="twitter:image" content="${esc(hero)}">
<meta name="theme-color" content="#17171b">
<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Residence', name: p.title,
      description: shortDesc, image: hero, url: canonical,
      address: { '@type': 'PostalAddress', addressLocality: p.city, addressRegion: p.state, addressCountry: 'IN' },
    })}</script>
<style>
  :root{--red:#e11414;--gold:#d4a627;--ink:#17171b;--cream:#fdf8ef}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans',sans-serif;background:var(--ink);color:#fff;min-height:100vh}
  .wrap{max-width:640px;margin:0 auto;background:linear-gradient(180deg,#1d1d22 0%,#17171b 100%)}
  .hero{position:relative;aspect-ratio:16/10;overflow:hidden}
  .hero img{width:100%;height:100%;object-fit:cover;display:block}
  .hero::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(23,23,27,.15) 40%,rgba(23,23,27,.95) 100%)}
  .brandbar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:14px 18px;z-index:2;background:linear-gradient(180deg,rgba(0,0,0,.55),transparent)}
  .brandbar img{width:34px;height:34px;border-radius:8px}
  .brandbar b{font-size:15px;letter-spacing:.14em}
  .brandbar span{color:var(--gold);font-size:10px;letter-spacing:.2em;text-transform:uppercase}
  .phase{position:absolute;right:14px;top:64px;z-index:2;background:var(--gold);color:#221a05;font-weight:700;font-size:11px;letter-spacing:.06em;padding:5px 12px;border-radius:99px;text-transform:uppercase}
  .head{position:relative;z-index:2;margin-top:-84px;padding:0 18px}
  h1{font-size:26px;line-height:1.2;text-shadow:0 2px 12px rgba(0,0,0,.5)}
  .loc{color:#e6d9b8;font-size:13px;margin-top:6px}
  .desc{padding:14px 18px 4px;color:#c9c9cf;font-size:14px;line-height:1.65}
  .stats{display:flex;gap:10px;padding:12px 18px;flex-wrap:wrap}
  .stat{background:rgba(255,255,255,.06);border:1px solid rgba(212,166,39,.35);border-radius:12px;padding:8px 14px;font-size:12px;color:#e8e8ee}
  .stat b{color:var(--gold);font-size:15px;display:block}
  .ctas{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 18px}
  .btn{display:flex;align-items:center;justify-content:center;gap:8px;border-radius:14px;padding:14px 10px;font-weight:700;font-size:14px;text-decoration:none;color:#fff;border:0;cursor:pointer}
  .btn.primary{background:linear-gradient(135deg,#f11c1c,#b90707);grid-column:1/-1;font-size:16px;box-shadow:0 8px 24px rgba(225,20,20,.35)}
  .btn.ghost{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18)}
  .btn.gold{background:linear-gradient(135deg,#e7bc45,#c1922a);color:#221a05}
  .pcard{margin:8px 18px;background:var(--cream);border-radius:18px;padding:16px;color:var(--ink)}
  .prow{display:flex;gap:14px;align-items:center}
  .pavatar{width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--gold)}
  .pinit{display:flex;align-items:center;justify-content:center;background:var(--red);color:#fff;font-size:30px;font-weight:800}
  .plabel{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a8577}
  .pname{font-size:19px;font-weight:800}
  .badge{display:inline-flex;align-items:center;gap:6px;background:#178c47;color:#fff;font-size:11px;font-weight:700;border-radius:99px;padding:4px 12px;margin-top:5px}
  .pid{font-size:11px;color:#8a8577;margin-top:4px;letter-spacing:.06em}
  .pactions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  .chip{background:#fff;border:1px solid #e3dccb;border-radius:99px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none}
  .chip.wa{background:#e9f9ef;border-color:#b5e3c6}
  .qrbox{display:flex;gap:14px;align-items:center;margin:14px 18px;background:rgba(255,255,255,.05);border:1px dashed rgba(212,166,39,.5);border-radius:16px;padding:14px}
  .qrbox svg{border-radius:10px;background:#fff;padding:4px}
  .qrbox p{font-size:12px;color:#c9c9cf;line-height:1.5}
  .form{margin:8px 18px 26px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:16px}
  .form h3{font-size:15px;margin-bottom:10px;color:var(--gold)}
  .form input,.form textarea{width:100%;background:#101013;border:1px solid rgba(255,255,255,.16);border-radius:10px;color:#fff;padding:12px;font-size:14px;margin-bottom:10px}
  .form .ok{color:#7ee2a8;font-size:13px;padding:6px 0}
  footer{padding:18px;text-align:center;color:#6f6f78;font-size:11px;line-height:1.7}
  @media(min-width:641px){.wrap{border-radius:0 0 24px 24px;overflow:hidden}}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="brandbar"><img src="${esc(siteBase)}/logo.png" alt=""><div><b>${esc(brand.toUpperCase())}</b><br><span>${esc(cfg.tagline ?? 'Signature for Fortune')}</span></div></div>
    ${phaseLabel ? `<div class="phase">${esc(phaseLabel)}</div>` : ''}
    <img src="${esc(hero)}" alt="${esc(p.title)}">
  </div>
  <div class="head"><h1>${esc(p.title)}</h1>${loc ? `<div class="loc">📍 ${esc(loc)}</div>` : ''}</div>
  <div class="desc">${esc(shortDesc)}${String(desc).length > 200 ? '…' : ''}</div>
  <div class="stats">
    ${p.plots_total ? `<div class="stat"><b>${esc(p.plots_total)}</b>${esc(t.plots)}</div>` : ''}
    ${p.plots_available ? `<div class="stat"><b>${esc(p.plots_available)}</b>${esc(t.available)}</div>` : ''}
    ${p.rera_number ? `<div class="stat"><b>DTCP</b>${esc(p.rera_number)}</div>` : ''}
  </div>
  <div class="ctas">
    <a class="btn primary" href="jamindar://property/${esc(p.id)}" onclick="setTimeout(function(){location.href='${esc(siteBase)}/welcome?p=${esc(p.id)}&ref=${encodeURIComponent(refCode || '')}'},900)">🏡 ${esc(t.view)}</a>
    ${p.brochure_url ? `<a class="btn gold" href="${esc(brochureHref)}">📄 ${esc(t.brochure)}</a>` : ''}
    <button class="btn ghost" onclick="document.getElementById('leadform').scrollIntoView({behavior:'smooth'});window.__intent='site_visit';document.getElementById('ftitle').textContent='${esc(t.visit)}'">📅 ${esc(t.visit)}</button>
  </div>
  ${promoterCard}
  <div class="qrbox">${qrSvg}<p><b>${esc(t.scan)}</b><br>${esc(canonical)}</p></div>
  <div class="form" id="leadform">
    <h3 id="ftitle">${esc(t.enquire)}</h3>
    <input id="f_name" placeholder="${esc(t.name)}" maxlength="80">
    <input id="f_mobile" placeholder="${esc(t.mobile)}" inputmode="numeric" maxlength="13">
    <textarea id="f_msg" placeholder="${esc(t.message)}" rows="2"></textarea>
    <button class="btn primary" style="width:100%" onclick="sendLead()">${esc(t.send)}</button>
    <div class="ok" id="f_ok" style="display:none">${esc(t.sent)}</div>
  </div>
  <footer>${esc(brand)} · ${esc(loc || 'Tamil Nadu')} · Helpdesk ${esc(cfg.desk_phone ?? '+91 93848 18895')}<br>© ${new Date().getFullYear()} ${esc(brand)}. All rights reserved.</footer>
</div>
<script>
async function sendLead(){
  var b=document.querySelector('#leadform .btn'); b.disabled=true;
  try{
    var r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      action:'lead', ref:${JSON.stringify(refCode ?? '')}, intent:window.__intent||'enquiry',
      name:document.getElementById('f_name').value, mobile:document.getElementById('f_mobile').value,
      message:document.getElementById('f_msg').value})});
    var d=await r.json();
    if(d.ok){document.getElementById('f_ok').style.display='block';}else{alert(d.error||'Please try again.');}
  }catch(e){alert('Network error — please try again.');}
  b.disabled=false;
}
</script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=60',
      },
    });
  } catch (_e) {
    return new Response('Something went wrong', { status: 500 });
  }
});
