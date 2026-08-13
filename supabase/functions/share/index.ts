// Jamindar — branded share pages Edge Function (0053, v2).
// GET  /share/<propertyId>?ref=<code>[&lang=ta]  → premium project share page
// GET  /share/invite/<code>[?lang=ta]            → premium promoter invite page
//      Both server-render full Open Graph/Twitter meta so WhatsApp/Telegram/FB/
//      LinkedIn/X/iMessage show rich preview cards instead of plain links.
// POST /share/<propertyId> {action:'lead'|...}   → attributed lead / site-visit
// POST /share/invite/<code> {action:'wa'}        → WhatsApp app-request funnel
// Served on the branded domain via Netlify proxies: /s/* and /i/*.
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
    available: 'available', highlights: 'Highlights', phase_future: 'Future Project',
    phase_ongoing: 'Ongoing Project', phase_current: 'Upcoming Project', phase_completed: 'Completed Project',
    inviteTitle: 'invites you to Jamin Properties', inviteCode: 'Your invite code', copy: 'Copy code',
    copied: 'Copied!', openApp: 'Open the Jamindar App', getWa: 'Get the app on WhatsApp',
    liveProjects: 'Live Projects', refLabel: 'Referral code', trackLabel: 'Tracking ID',
    priceOnRequest: 'Price on Request', negotiable: 'Negotiable', approved: 'Approved', soldOut: 'Sold Out',
  },
  ta: {
    view: 'திட்டத்தைப் பார்க்க', brochure: 'விவரக்கையேடு பதிவிறக்க', call: 'அழைக்க', whatsapp: 'வாட்ஸ்அப்',
    visit: 'நேரில் பார்வையிட முன்பதிவு', enquire: 'விசாரணை அனுப்ப', name: 'உங்கள் பெயர்', mobile: '10 இலக்க மொபைல்',
    message: 'செய்தி (விருப்பம்)', send: 'சமர்ப்பிக்க', sent: 'நன்றி! விரைவில் உங்களை தொடர்பு கொள்வோம்.',
    scan: 'இந்தப் பக்கத்தை திறக்க ஸ்கேன் செய்யவும்', partner: 'உங்கள் சொந்த சொத்து பங்குதாரர்', plots: 'மனைகள்',
    available: 'கிடைக்கின்றன', highlights: 'சிறப்பம்சங்கள்', phase_future: 'எதிர்கால திட்டம்',
    phase_ongoing: 'நடைபெறும் திட்டம்', phase_current: 'வரவிருக்கும் திட்டம்', phase_completed: 'நிறைவடைந்த திட்டம்',
    inviteTitle: 'ஜமீன் ப்ராப்பர்டீஸுக்கு உங்களை அழைக்கிறார்', inviteCode: 'உங்கள் அழைப்புக் குறியீடு', copy: 'குறியீட்டை நகலெடு',
    copied: 'நகலெடுக்கப்பட்டது!', openApp: 'ஜமீன்தார் ஆப்பை திறக்க', getWa: 'வாட்ஸ்அப்பில் ஆப்பை பெற',
    liveProjects: 'நடப்பு திட்டங்கள்', refLabel: 'பரிந்துரை குறியீடு', trackLabel: 'கண்காணிப்பு ஐடி',
    priceOnRequest: 'விலை விசாரணையில்', negotiable: 'பேசித் தீர்மானிக்கலாம்', approved: 'அங்கீகாரம்', soldOut: 'விற்றுத் தீர்ந்தது',
  },
  hi: {
    view: 'प्रोजेक्ट देखें', brochure: 'ब्रोशर डाउनलोड करें', call: 'कॉल करें', whatsapp: 'व्हाट्सऐप',
    visit: 'साइट विज़िट बुक करें', enquire: 'पूछताछ भेजें', name: 'आपका नाम', mobile: '10 अंकों का मोबाइल',
    message: 'संदेश (वैकल्पिक)', send: 'भेजें', sent: 'धन्यवाद! हम शीघ्र संपर्क करेंगे।',
    scan: 'यह पेज खोलने के लिए स्कैन करें', partner: 'आपके निजी प्रॉपर्टी पार्टनर', plots: 'प्लॉट',
    available: 'उपलब्ध', highlights: 'मुख्य विशेषताएं', phase_future: 'भविष्य का प्रोजेक्ट',
    phase_ongoing: 'चालू प्रोजेक्ट', phase_current: 'आगामी प्रोजेक्ट', phase_completed: 'पूर्ण प्रोजेक्ट',
    inviteTitle: 'आपको जमीन प्रॉपर्टीज़ पर आमंत्रित करते हैं', inviteCode: 'आपका इनवाइट कोड', copy: 'कोड कॉपी करें',
    copied: 'कॉपी हो गया!', openApp: 'जमींदार ऐप खोलें', getWa: 'व्हाट्सऐप पर ऐप पाएं',
    liveProjects: 'लाइव प्रोजेक्ट्स', refLabel: 'रेफरल कोड', trackLabel: 'ट्रैकिंग आईडी',
    priceOnRequest: 'मूल्य अनुरोध पर', negotiable: 'परक्राम्य', approved: 'स्वीकृत', soldOut: 'बिक चुका',
  },
};

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function digitsWa(s: string): string {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  return d;
}

const STYLE = `
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
  .head{position:relative;z-index:2;margin-top:-84px;padding:0 18px;min-height:96px}
  h1{font-size:26px;line-height:1.2;text-shadow:0 2px 12px rgba(0,0,0,.5)}
  .loc{color:#e6d9b8;font-size:13px;margin-top:6px}
  .price{display:inline-flex;align-items:center;gap:8px;margin-top:10px;background:rgba(212,166,39,.16);border:1px solid rgba(212,166,39,.55);color:#f4e3ae;border-radius:12px;padding:8px 14px;font-size:15px;font-weight:800}
  .price small{font-weight:600;font-size:11px;color:#d8c58a}
  .soldtag{display:inline-block;margin-left:8px;background:#8a1010;color:#fff;font-size:11px;font-weight:800;letter-spacing:.06em;border-radius:99px;padding:5px 12px;text-transform:uppercase;vertical-align:middle}
  .appr{display:flex;gap:8px;padding:12px 18px 0;flex-wrap:wrap}
  .appr span{display:inline-flex;align-items:center;gap:6px;background:rgba(23,140,71,.16);border:1px solid rgba(23,140,71,.55);color:#8fe6b2;border-radius:99px;padding:6px 12px;font-size:12px;font-weight:700}
  .desc{padding:14px 18px 4px;color:#c9c9cf;font-size:14px;line-height:1.65}
  .hl{display:flex;gap:8px;padding:10px 18px 0;flex-wrap:wrap}
  .hl span{background:rgba(212,166,39,.14);border:1px solid rgba(212,166,39,.4);color:#eeddaa;border-radius:99px;padding:6px 12px;font-size:12px}
  .stats{display:flex;gap:10px;padding:12px 18px;flex-wrap:wrap}
  .stat{background:rgba(255,255,255,.06);border:1px solid rgba(212,166,39,.35);border-radius:12px;padding:8px 14px;font-size:12px;color:#e8e8ee}
  .stat b{color:var(--gold);font-size:15px;display:block}
  .ctas{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 18px}
  .btn{display:flex;align-items:center;justify-content:center;gap:8px;border-radius:14px;padding:14px 10px;font-weight:700;font-size:14px;text-decoration:none;color:#fff;border:0;cursor:pointer}
  .btn.primary{background:linear-gradient(135deg,#f11c1c,#b90707);grid-column:1/-1;font-size:16px;box-shadow:0 8px 24px rgba(225,20,20,.35)}
  .btn.ghost{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18)}
  .btn.gold{background:linear-gradient(135deg,#e7bc45,#c1922a);color:#221a05}
  .btn.wa{background:linear-gradient(135deg,#28c05a,#128a3c)}
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
  .qrbox svg{border-radius:10px;background:#fff;padding:4px;flex-shrink:0}
  .qrbox p{font-size:12px;color:#c9c9cf;line-height:1.5;word-break:break-all}
  .form{margin:8px 18px 26px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:16px}
  .form h3{font-size:15px;margin-bottom:10px;color:var(--gold)}
  .form input,.form textarea{width:100%;background:#101013;border:1px solid rgba(255,255,255,.16);border-radius:10px;color:#fff;padding:12px;font-size:14px;margin-bottom:10px}
  .form .ok{color:#7ee2a8;font-size:13px;padding:6px 0}
  .code{margin:14px 18px;background:var(--cream);border-radius:18px;padding:18px;text-align:center;color:var(--ink)}
  .code .clabel{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a8577}
  .code .cval{font-size:30px;font-weight:900;letter-spacing:.08em;margin:6px 0;color:var(--red)}
  .projgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:6px 18px 16px}
  .proj{display:block;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:14px;overflow:hidden;text-decoration:none;color:#fff}
  .proj img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block}
  .proj .pb{padding:10px}
  .proj .pt{font-size:13px;font-weight:700;line-height:1.3}
  .proj .pc{font-size:11px;color:#c3b98f;margin-top:3px}
  footer{padding:18px;text-align:center;color:#6f6f78;font-size:11px;line-height:1.7}
  @media(min-width:641px){.wrap{border-radius:0 0 24px 24px;overflow:hidden}}
`;

function brandbar(brand: string, tagline: string, siteBase: string) {
  return `<div class="brandbar"><img src="${esc(siteBase)}/logo.png" alt=""><div><b>${esc(brand.toUpperCase())}</b><br><span>${esc(tagline)}</span></div></div>`;
}

function pageHead(o: { lang: string; title: string; desc: string; image: string; url: string; brand: string; type?: string }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${esc(o.url)}">
<meta property="og:type" content="${o.type ?? 'website'}">
<meta property="og:site_name" content="${esc(o.brand)}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:image" content="${esc(o.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(o.url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${esc(o.image)}">
<meta name="theme-color" content="#17171b">
<style>${STYLE}</style>`;
}

function promoterCardHtml(pr: any, t: Record<string, string>, badge: string, siteBase: string, waText: string, extraLine?: string) {
  const wa = digitsWa(pr.whatsapp || pr.mobile || '');
  // logC() (defined on both pages) records call/WhatsApp/email/V-Card taps as
  // attributed referral events (owner spec 29-07 §6).
  return `
  <div class="pcard">
    <div class="prow">
      ${pr.avatar_url ? `<img class="pavatar" src="${esc(pr.avatar_url)}" alt="${esc(pr.name)}">` : `<div class="pavatar pinit">${esc(String(pr.name ?? 'J').charAt(0))}</div>`}
      <div>
        <div class="plabel">${esc(t.partner)}</div>
        <div class="pname">${esc(pr.name)}</div>
        ${pr.verified ? `<div class="badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>${esc(badge)}</div>` : ''}
        <div class="pid">${esc(pr.partner_code ?? '')}${pr.partner_code && pr.referral_code ? ' · ' : ''}${esc(pr.referral_code ?? '')}</div>
        ${extraLine ? `<div class="pid">${extraLine}</div>` : ''}
      </div>
    </div>
    <div class="pactions">
      ${pr.mobile ? `<a class="chip" href="tel:${esc(pr.mobile)}" onclick="logC('call')">📞 ${esc(t.call)}</a>` : ''}
      ${wa ? `<a class="chip wa" href="https://wa.me/${wa}?text=${waText}" onclick="logC('whatsapp')">🟢 ${esc(t.whatsapp)}</a>` : ''}
      ${pr.email ? `<a class="chip" href="mailto:${esc(pr.email)}" onclick="logC('email')">✉️ Email</a>` : ''}
      <a class="chip" href="${esc(siteBase)}/card?c=${encodeURIComponent(pr.partner_code ?? pr.referral_code ?? '')}" onclick="logC('vcard')">💳 V-Card</a>
    </div>
  </div>`;
}

/** Inline script that posts contact-click events back to this page's endpoint. */
const LOGC_SCRIPT = `<script>function logC(ch){try{fetch(location.pathname+location.search,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'contact_click',channel:ch}),keepalive:true})}catch(e){}}</script>`;

// ───────────────────────── invite page (/i/<code>) ─────────────────────────
async function renderInvite(code: string, lang: string, siteBase0: string): Promise<Response> {
  const t = T[lang];
  const [{ data: card }, { data: cfgRow }] = await Promise.all([
    svc.rpc('promoter_card', { p_code: code }),
    svc.from('site_config').select('value').eq('key', 'share').maybeSingle(),
  ]);
  const pr = card as any;
  const cfg = (cfgRow as any)?.value ?? {};
  const brand = cfg.brand_name ?? 'Jamin Properties';
  const siteBase = cfg.site_base ?? siteBase0;
  const badge = cfg.badge_label ?? 'Verified Jamin Bazaar Partner';
  if (!pr || pr.error || !pr.name) return new Response('Invite not found', { status: 404 });

  const refCode = pr.referral_code ?? code;
  const canonical = `${siteBase}/i/${encodeURIComponent(refCode)}`;
  /**
   * 🚨 THE INVITE CARD CARRIES A FIXED BRAND BANNER, not a project photo.
   *
   * Owner's instruction 2026-08-13: "change the card image", with the banner
   * supplied. It used to be `the first of this promoter's projects that has a
   * photo`, falling back to `/jamindar.jpg` — which meant an invitation from
   * Abraham looked different from one from Priya, and both changed the day an
   * admin edited a property cover. An invite is a BRAND page: the subject is
   * the person and the company, not a development, and nothing on it names the
   * project whose picture it was borrowing.
   *
   * ⚠️ IT IS ALSO THE og:image (passed to `pageHead` below), so this is the
   * picture that appears when the link is pasted into WhatsApp. Kept to 220 KB
   * at 1200x750 for exactly that reason — `shrinkOgImages` in the Netlify proxy
   * only rewrites Supabase *storage* URLs through the render CDN, so a file
   * served from the site's own origin has to arrive already small. See the note
   * on that function before enlarging this.
   *
   * ⚠️ 16:10 to match `.hero { aspect-ratio: 16/10 }` — cropped at build time
   * rather than by `object-fit`, so the banner's own type is never cut.
   */
  const heroImg = `${siteBase}/invite-card.jpg`;
  const title = `${pr.name} ${T.en.inviteTitle}`;
  const descTxt = `Verified plots & land with clear titles. Join with invite code ${refCode} for personal assistance from ${pr.name}.`;
  const qrSvg = await QRCode.toString(canonical, { type: 'svg', margin: 1, width: 132, color: { dark: '#1c1c20', light: '#ffffff' } });
  const deskWa = digitsWa(cfg.desk_phone ?? '+919384818895');
  const waText = encodeURIComponent(`Hi ${pr.name}, I got your Jamin Properties invite (${refCode}).`);
  const deskText = encodeURIComponent(`Hi! Please send me the Jamindar app download link. My invite code: ${refCode}`);

  svc.rpc('log_share_event', { p_ref: refCode, p_property: null, p_event: 'click', p_channel: 'invite_page' }).then(() => {});

  const projs = (Array.isArray(pr.projects) ? pr.projects : []).slice(0, 4);
  const html = `<!doctype html>
<html lang="${lang}">
<head>${pageHead({ lang, title, desc: descTxt, image: heroImg, url: canonical, brand, type: 'profile' })}</head>
<body>
<div class="wrap">
  <div class="hero">${brandbar(brand, cfg.tagline ?? 'Signature for Fortune', siteBase)}<img src="${esc(heroImg)}" alt=""></div>
  <div class="head"><h1>${esc(pr.name)}</h1><div class="loc">${esc(T[lang].inviteTitle)}</div></div>
  ${promoterCardHtml(pr, t, badge, siteBase, waText)}
  <div class="code">
    <div class="clabel">${esc(t.inviteCode)}</div>
    <div class="cval" id="code">${esc(refCode)}</div>
    <button class="btn gold" style="width:100%" onclick="navigator.clipboard.writeText('${esc(refCode)}').then(()=>{this.textContent='${esc(t.copied)}'})">📋 ${esc(t.copy)}</button>
  </div>
  <div class="ctas">
    <a class="btn primary" href="jamindar://welcome?ref=${encodeURIComponent(refCode)}">📱 ${esc(t.openApp)}</a>
    <a class="btn wa" style="grid-column:1/-1" href="https://wa.me/${deskWa}?text=${deskText}" onclick="fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'wa'}),keepalive:true})">🟢 ${esc(t.getWa)}</a>
  </div>
  ${projs.length ? `<div class="desc" style="padding-top:0"><b style="color:var(--gold)">${esc(t.liveProjects)}</b></div>
  <div class="projgrid">${projs.map((x: any) => `
    <a class="proj" href="${esc(siteBase)}/s/${esc(x.id)}?ref=${encodeURIComponent(refCode)}">
      ${x.image ? `<img loading="lazy" src="${esc(x.image)}" alt="">` : ''}
      <div class="pb"><div class="pt">${esc(x.title)}</div><div class="pc">${esc(x.city ?? '')}</div></div>
    </a>`).join('')}</div>` : ''}
  <div class="qrbox">${qrSvg}<p><b>${esc(t.scan)}</b><br>${esc(canonical)}</p></div>
  <footer>${esc(brand)} · Helpdesk ${esc(cfg.desk_phone ?? '+91 93848 18895')}<br>${esc(t.refLabel)}: ${esc(refCode)} · ${esc(t.trackLabel)}: ${esc(pr.partner_code ?? pr.member_code ?? refCode)}<br>© ${new Date().getFullYear()} ${esc(brand)}. All rights reserved.</footer>
</div>
${LOGC_SCRIPT}
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=60' } });
}

// ───────────────────────── property page (/s/<id>) ─────────────────────────
async function renderProperty(propertyId: string, ref: string, lang: string, siteBase0: string): Promise<Response> {
  const t = T[lang];
  const { data } = await svc.rpc('share_page_data', { p_property: propertyId, p_ref: ref || null });
  const d = data as any;
  if (!d?.ok) return new Response('Not found', { status: 404 });
  const p = d.property, pr = d.promoter, cfg = d.config ?? {};
  const brand = cfg.brand_name ?? 'Jamin Properties';
  const siteBase = cfg.site_base ?? siteBase0;
  const badge = cfg.badge_label ?? 'Verified Jamin Bazaar Partner';
  const refCode = pr?.referral_code ?? ref;
  const canonical = `${siteBase}/s/${p.id}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`;
  const hero = Array.isArray(p.images) && p.images.length ? String(p.images[0]) : `${siteBase}/jamindar.jpg`;
  const desc = (lang !== 'en' && p.translations?.[lang]?.description) || p.description ||
    `${p.title} — premium plotted development by ${brand}.`;
  const shortDesc = String(desc).replace(/\s+/g, ' ').slice(0, 200);
  const loc = [p.city, p.district, p.state].filter((v: string, i: number, a: string[]) => v && a.indexOf(v) === i).join(', ');
  const phaseLabel = t[`phase_${p.project_phase}`] ?? '';
  const brochureHref = `${siteBase}/b/${p.id}?ref=${encodeURIComponent(refCode || '')}&src=sharepage`;
  const waText = encodeURIComponent(`Hi${pr ? ' ' + pr.name : ''}, I'm interested in ${p.title}${refCode ? ` (Ref: ${refCode})` : ''}`);
  const qrSvg = await QRCode.toString(canonical, { type: 'svg', margin: 1, width: 132, color: { dark: '#1c1c20', light: '#ffffff' } });
  const highlights = (Array.isArray(p.amenities) ? p.amenities : [])
    .map((a: any) => (typeof a === 'string' ? a : a?.label ?? a?.name ?? ''))
    .filter(Boolean).slice(0, 4);

  // Explicit price line (spec §4) — real price in Indian format, else "Price on Request".
  const UNIT_LABEL: Record<string, string> = { per_sqft: '/ sq.ft', per_cent: '/ cent', per_acre: '/ acre' };
  const priceHtml = p.price
    ? `<div class="price">💰 ₹${Number(p.price).toLocaleString('en-IN')}${UNIT_LABEL[p.price_unit] ? ` <small>${esc(UNIT_LABEL[p.price_unit])}</small>` : ''}${p.price_negotiable ? ` <small>· ${esc(t.negotiable)}</small>` : ''}</div>`
    : `<div class="price">💰 ${esc(t.priceOnRequest)}</div>`;
  const soldTag = p.status === 'sold' ? `<span class="soldtag">${esc(t.soldOut)}</span>` : '';

  // Approval badges (spec §4) — from the approvals jsonb ({dtcp:true,…}) + RERA number.
  const apprChips: string[] = Object.entries((p.approvals ?? {}) as Record<string, unknown>)
    .filter(([, v]) => !!v)
    .map(([k]) => `<span>✔ ${esc(k.toUpperCase())} ${esc(t.approved)}</span>`);
  if (p.rera_number) apprChips.push(`<span>✔ RERA ${esc(p.rera_number)}</span>`);
  const apprHtml = apprChips.length ? `<div class="appr">${apprChips.join('')}</div>` : '';

  if (ref) svc.rpc('log_share_event', { p_ref: ref, p_property: p.id, p_event: 'click', p_channel: 'share_page' }).then(() => {});

  const html = `<!doctype html>
<html lang="${lang}">
<head>${pageHead({ lang, title: `${p.title}${loc ? ' · ' + loc : ''}`, desc: shortDesc, image: hero, url: canonical, brand })}
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Residence', name: p.title,
    description: shortDesc, image: hero, url: canonical,
    address: { '@type': 'PostalAddress', addressLocality: p.city, addressRegion: p.state, addressCountry: 'IN' },
  })}</script></head>
<body>
<div class="wrap">
  <div class="hero">
    ${brandbar(brand, cfg.tagline ?? 'Signature for Fortune', siteBase)}
    ${phaseLabel ? `<div class="phase">${esc(phaseLabel)}</div>` : ''}
    <img src="${esc(hero)}" alt="${esc(p.title)}">
  </div>
  <div class="head"><h1>${esc(p.title)}</h1>${loc ? `<div class="loc">📍 ${esc(loc)}</div>` : ''}${priceHtml}${soldTag}</div>
  ${apprHtml}
  ${highlights.length ? `<div class="hl">${highlights.map((h: string) => `<span>✦ ${esc(h)}</span>`).join('')}</div>` : ''}
  <div class="desc">${esc(shortDesc)}${String(desc).length > 200 ? '…' : ''}</div>
  <div class="stats">
    ${p.plots_total ? `<div class="stat"><b>${esc(p.plots_total)}</b>${esc(t.plots)}</div>` : ''}
    ${p.plots_available ? `<div class="stat"><b>${esc(p.plots_available)}</b>${esc(t.available)}</div>` : ''}
    ${p.rera_number ? `<div class="stat"><b>DTCP</b>${esc(p.rera_number)}</div>` : ''}
  </div>
  <div class="ctas">
    <a class="btn primary" href="jamindar://property/${esc(p.id)}" onclick="fetch(location.pathname+location.search,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'wa_intent'}),keepalive:true});setTimeout(function(){location.href='https://wa.me/${digitsWa(cfg.desk_phone ?? '+919384818895')}?text=${encodeURIComponent(`Hi! Please send me the Jamindar app link to view ${p.title}.${refCode ? ` (Ref: ${refCode})` : ''}`)}'},1200)">🏡 ${esc(t.view)}</a>
    ${p.brochure_url ? `<a class="btn gold" href="${esc(brochureHref)}">📄 ${esc(t.brochure)}</a>` : ''}
    <button class="btn ghost" onclick="document.getElementById('leadform').scrollIntoView({behavior:'smooth'});window.__intent='site_visit';document.getElementById('ftitle').textContent='${esc(t.visit)}'">📅 ${esc(t.visit)}</button>
  </div>
  ${pr ? promoterCardHtml(pr, t, badge, siteBase, waText, `${esc(t.refLabel)}: ${esc(refCode)} · ${esc(t.trackLabel)}: ${esc(pr.partner_code ?? refCode)}`) : ''}
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
    if(d.ok){
      document.getElementById('f_ok').style.display='block';
      document.getElementById('f_name').value='';
      document.getElementById('f_mobile').value='';
      document.getElementById('f_msg').value='';
      setTimeout(function(){document.getElementById('f_ok').style.display='none';},6000);
    }else{alert(d.error||'Please try again.');}
  }catch(e){alert('Network error — please try again.');}
  b.disabled=false;
}
</script>
${LOGC_SCRIPT}
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=60' } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const lang = ['ta', 'hi'].includes(url.searchParams.get('lang') ?? '') ? url.searchParams.get('lang')! : 'en';
    const isInvite = parts.includes('invite');
    const lastSeg = decodeURIComponent(parts[parts.length - 1] ?? '');
    const siteBase0 = 'https://merry-begonia-4c3cd1.netlify.app';

    if (isInvite) {
      if (!/^[A-Za-z0-9-]{4,24}$/.test(lastSeg)) return new Response('Not found', { status: 404 });
      if (req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        if (body.action === 'wa') {
          await svc.rpc('log_wa_request', { p_code: lastSeg, p_source: 'invite_page', p_property: null }).then(() => {}, () => {});
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (body.action === 'contact_click') {
          const ch = 'contact_' + String(body.channel ?? 'other').replace(/[^a-z_]/gi, '').slice(0, 16);
          await svc.rpc('log_share_event', { p_ref: lastSeg, p_property: null, p_event: 'click', p_channel: ch }).then(() => {}, () => {});
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: false }), { headers: { 'Content-Type': 'application/json' } });
      }
      return await renderInvite(lastSeg, lang, siteBase0);
    }

    const propertyId = lastSeg;
    if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return new Response('Not found', { status: 404 });

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body.action === 'wa_intent') {
        const ref = (url.searchParams.get('ref') ?? '').trim();
        if (ref) await svc.rpc('log_wa_request', { p_code: ref, p_source: 'share_page', p_property: propertyId }).then(() => {}, () => {});
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (body.action === 'contact_click') {
        const ref = (url.searchParams.get('ref') ?? String(body.ref ?? '')).trim();
        const ch = 'contact_' + String(body.channel ?? 'other').replace(/[^a-z_]/gi, '').slice(0, 16);
        if (ref) await svc.rpc('log_share_event', { p_ref: ref, p_property: propertyId, p_event: 'click', p_channel: ch }).then(() => {}, () => {});
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      const { data } = await svc.rpc('share_capture_lead', {
        p_ref: String(body.ref ?? ''), p_property: propertyId,
        p_name: String(body.name ?? ''), p_mobile: String(body.mobile ?? ''),
        p_message: String(body.message ?? ''), p_intent: body.intent === 'site_visit' ? 'site_visit' : 'enquiry',
      });
      return new Response(JSON.stringify(data ?? { ok: false }), { headers: { 'Content-Type': 'application/json' } });
    }

    return await renderProperty(propertyId, (url.searchParams.get('ref') ?? '').trim(), lang, siteBase0);
  } catch (_e) {
    return new Response('Something went wrong', { status: 500 });
  }
});
