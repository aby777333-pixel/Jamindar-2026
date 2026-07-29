// Jamin Bazaar — dynamic brochure Edge Function (0053, v3 per owner spec 29-07).
// GET /brochure/<propertyId>?ref=<JA-REF-xxxxx | JA-P-xxxx | member code>[&src=app|sharepage|whatsapp]
//
// A fresh personalized PDF is generated from the LATEST database profile at
// request time — the original brochure pages are never modified; only ONE
// branded contact page is appended:
//   • super-admin ref         → the official corporate contact page.
//   • verified promoter ref   → their live photo, badge, IDs, contacts, dual QR.
//   • any other member's ref  → their own name / phone / email (v3: every
//     logged-in user shares a brochure carrying THEIR contact details).
//   • no ref / unknown ref    → the original brochure untouched.
// Freshness: the cache key hashes every personalized field, so ANY profile
// change produces a new PDF immediately; stale copies can never be served.
// On ANY failure it falls back to the original brochure so downloads never break.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.3';

const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const STORAGE_PUBLIC = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/property-media/`;

const RED = rgb(0.85, 0.05, 0.05);
const CHARCOAL = rgb(0.11, 0.11, 0.13);
const GOLD = rgb(0.83, 0.65, 0.15);
const GREEN = rgb(0.09, 0.55, 0.28);
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.42, 0.42, 0.42);
const CREAM = rgb(1, 0.973, 0.93);
const HAIR = rgb(0.88, 0.85, 0.78);

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}

async function hashKey(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Word-wrap by MEASURED width so values can never collide with the QR column. */
function wrapText(font: any, text: string, size: number, maxW: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxW || !cur) cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** Draw a QR code as pure vector rectangles (no canvas/PNG needed). */
function drawQr(page: any, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = size / n;
  page.drawRectangle({ x: x - 7, y: y - 7, width: size + 14, height: size + 14, color: rgb(1, 1, 1), borderColor: GOLD, borderWidth: 1.2 });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: INK });
      }
    }
  }
}

async function fetchImage(doc: any, url: string): Promise<any | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch (_) {
    return null;
  }
}

Deno.serve(async (req) => {
  let original = '';
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const propertyId = parts[parts.length - 1];
    const ref = (url.searchParams.get('ref') ?? '').trim();
    const channel = (url.searchParams.get('src') ?? 'web').slice(0, 24);
    if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return new Response('Not found', { status: 404 });

    const { data } = await svc.rpc('share_page_data', { p_property: propertyId, p_ref: ref || null });
    const d = data as any;
    if (!d?.ok || !d.property?.brochure_url) return new Response('Brochure not available', { status: 404 });
    original = d.property.brochure_url as string;
    const promoter = d.promoter; // promoters / verified partners / super admins only
    const cfg = d.config ?? {};
    const siteBase = cfg.site_base ?? 'https://merry-begonia-4c3cd1.netlify.app';
    const brand = cfg.brand_name ?? 'Jamin Bazaar';
    const badge = cfg.badge_label ?? 'Verified Jamin Bazaar Partner';

    // v3: resolve ANY member by their code (buyer referrals carry their own
    // contact page). Latest data straight from the DB at generation time (§7).
    let person: any = null;
    if (promoter?.id) {
      const { data: pr } = await svc.from('profiles').select('role, city, district, state').eq('id', promoter.id).maybeSingle();
      person = { ...promoter, role: (pr as any)?.role ?? null,
        area: [(pr as any)?.city, (pr as any)?.district, (pr as any)?.state].filter(Boolean).join(', ') };
    } else if (ref && /^[A-Za-z0-9-]{3,40}$/.test(ref)) {
      const up = ref.toUpperCase();
      const { data: m } = await svc.from('profiles')
        .select('id, full_name, mobile, email, avatar_url, member_code, referral_code, role')
        .or(`referral_code.eq.${up},member_code.eq.${up}`)
        .maybeSingle();
      if (m) person = {
        id: (m as any).id, name: (m as any).full_name, mobile: (m as any).mobile, email: (m as any).email,
        avatar_url: (m as any).avatar_url, member_code: (m as any).member_code,
        referral_code: (m as any).referral_code, role: (m as any).role, verified: false, member: true,
      };
    }

    const logDownload = (pid: string | null) =>
      svc.from('brochure_downloads').insert({
        property_id: propertyId, user_id: null, promoter_id: pid,
        ref_code: (ref || person?.referral_code || '').toUpperCase() || null, channel,
      });

    // Unknown / missing ref → the original brochure, attribution still logged.
    if (!person) {
      await svc.rpc('log_share_event', { p_ref: ref, p_property: propertyId, p_event: 'download', p_channel: channel });
      return redirect(original);
    }

    const isCorporate = person.role === 'super_admin';
    const isVerified = !!person.verified;
    const corporate = cfg.corporate ?? {};
    const code = (person.partner_code ?? person.referral_code ?? person.member_code) as string;
    const refCode = (person.referral_code ?? code) as string;
    const shareLink = `${siteBase}/s/${propertyId}?ref=${encodeURIComponent(refCode)}`;
    const vcardLink = `${siteBase}/card?c=${encodeURIComponent(code)}`;
    const referralLink = `${siteBase}/welcome?ref=${encodeURIComponent(refCode)}`;

    const ver = await hashKey(
      isCorporate
        ? ['corp3', original, JSON.stringify(corporate), brand].join('|')
        : ['v3', original, person.name, person.mobile, person.whatsapp, person.email, person.avatar_url,
           person.designation, person.area, badge, brand, String(isVerified)].join('|'),
    );
    const keyBase = isCorporate ? 'JB-CORP' : (isVerified ? code : `JB-M-${code}`);
    const cachePath = `personalized/${propertyId}/${String(keyBase).replace(/[^A-Za-z0-9-]/g, '')}-${ver}.pdf`;

    // Cache hit (key includes every personalized field, so this is always fresh data).
    const dir = cachePath.substring(0, cachePath.lastIndexOf('/'));
    const base = cachePath.substring(cachePath.lastIndexOf('/') + 1);
    const { data: listing } = await svc.storage.from('property-media').list(dir, { search: base });
    if ((listing ?? []).some((f: any) => f.name === base)) {
      await logDownload(isCorporate ? null : person.id);
      return redirect(STORAGE_PUBLIC + cachePath);
    }

    // ── build the personalized PDF ─────────────────────────────────────────
    const srcBytes = new Uint8Array(await (await fetch(original)).arrayBuffer());
    const doc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const last = doc.getPage(doc.getPageCount() - 1);
    const { width: W, height: H } = last.getSize();
    const page = doc.addPage([W, H]);
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const logo = await fetchImage(doc, `${siteBase}/logo.png`);

    const L = 48;                              // left margin
    const qrSize = 116;
    const qrX = W - L - qrSize;                // QR column, right-aligned
    const valX = L + 96;                       // value column
    const valMaxW = qrX - 26 - valX;           // values may NEVER cross the QR

    // canvas + header band
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
    const bandH = Math.min(110, H * 0.135);
    page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: CHARCOAL });
    page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: GOLD });
    let brandX = L;
    if (logo) {
      const ls = 42;
      page.drawImage(logo, { x: L, y: H - bandH / 2 - ls / 2, width: ls, height: ls });
      brandX = L + ls + 14;
    }
    page.drawText(brand.toUpperCase(), { x: brandX, y: H - bandH / 2 + 3, size: 21, font: bold, color: rgb(1, 1, 1) });
    page.drawText((cfg.tagline ?? 'Signature for Fortune'), { x: brandX, y: H - bandH / 2 - 15, size: 10, font: helv, color: GOLD });

    const topY = H - bandH - 42;

    // shared helpers for tidy label/value rows
    let rowY = 0;
    function drawRow(label: string, value: string, valueSize = 11.5, valueColor = INK, valueFont = bold) {
      page.drawText(label.toUpperCase(), { x: L, y: rowY, size: 8.5, font: bold, color: MUTED });
      const lines = wrapText(valueFont, value, valueSize, valMaxW);
      let yy = rowY;
      for (const ln of lines) {
        page.drawText(ln, { x: valX, y: yy, size: valueSize, font: valueFont, color: valueColor });
        yy -= valueSize + 4;
      }
      const bottom = Math.min(yy + valueSize + 4, rowY) - 8;
      page.drawLine({ start: { x: L, y: bottom }, end: { x: qrX - 26, y: bottom }, thickness: 0.5, color: HAIR });
      rowY = bottom - 16;
    }
    function qrBlock(link: string, caption: string, y: number): number {
      drawQr(page, link, qrX, y - qrSize, qrSize);
      const capW = bold.widthOfTextAtSize(caption, 8.5);
      page.drawText(caption, { x: qrX + (qrSize - capW) / 2, y: y - qrSize - 20, size: 8.5, font: bold, color: MUTED });
      return y - qrSize - 34;
    }

    if (isCorporate) {
      // ── official corporate contact page ──
      page.drawText('CONTACT JAMIN BAZAAR', { x: L, y: topY, size: 12.5, font: bold, color: RED });
      page.drawText(String(corporate.company ?? 'Jamin Property Developers 1 Pvt Ltd'), { x: L, y: topY - 26, size: 17, font: bold, color: INK });
      page.drawRectangle({ x: L, y: topY - 36, width: 44, height: 3, color: GOLD });

      rowY = topY - 66;
      const rows: [string, string][] = ([
        ['Address', String(corporate.address ?? '')],
        ['Phone', String(corporate.phones ?? cfg.desk_phone ?? '')],
        ['Email', String(corporate.email ?? '')],
        ['Website', String(corporate.website ?? '')],
      ] as [string, string][]).filter(([, v]) => v);
      for (const [label, value] of rows) drawRow(label, value);

      qrBlock(`${siteBase}/s/${propertyId}`, 'Scan to view this project', topY - 8);
    } else {
      // ── personal contact page (verified partner OR any member) ──
      page.drawText(isVerified ? 'YOUR PERSONAL PROPERTY PARTNER' : 'SHARED WITH YOU BY', { x: L, y: topY, size: 12.5, font: bold, color: RED });

      let y = topY - 22;
      let photoBottom = y;
      let hasPhoto = false;
      if (person.avatar_url) {
        const img = await fetchImage(doc, person.avatar_url);
        if (img) {
          hasPhoto = true;
          const box = 92;
          const scale = Math.min(box / img.width, box / img.height);
          const iw = img.width * scale, ih = img.height * scale;
          page.drawRectangle({ x: L - 4, y: y - box - 4, width: box + 8, height: box + 8, color: rgb(1, 1, 1), borderColor: GOLD, borderWidth: 2 });
          page.drawImage(img, { x: L + (box - iw) / 2, y: y - box + (box - ih) / 2, width: iw, height: ih });
          photoBottom = y - box - 14;
        }
      }
      const nameX = hasPhoto ? L + 112 : L;
      page.drawText(String(person.name ?? 'Jamin Member'), { x: nameX, y: y - 20, size: 19, font: bold, color: INK });
      const subLine = isVerified
        ? [person.designation, person.area ? `Serving ${person.area}` : null].filter(Boolean).join(' · ')
        : 'Jamin Bazaar Member';
      if (subLine) page.drawText(subLine.slice(0, 70), { x: nameX, y: y - 37, size: 10.5, font: helv, color: MUTED });

      let badgeBottom = y - 48;
      if (isVerified) {
        const badgeY = y - 70;
        const badgeW = bold.widthOfTextAtSize(badge, 10.5) + 38;
        page.drawRectangle({ x: nameX, y: badgeY, width: badgeW, height: 23, color: GREEN });
        page.drawCircle({ x: nameX + 12, y: badgeY + 11.5, size: 7.5, color: rgb(1, 1, 1) });
        page.drawLine({ start: { x: nameX + 8.8, y: badgeY + 11.5 }, end: { x: nameX + 11.2, y: badgeY + 8.4 }, thickness: 1.7, color: GREEN });
        page.drawLine({ start: { x: nameX + 11.2, y: badgeY + 8.4 }, end: { x: nameX + 15.8, y: badgeY + 14.8 }, thickness: 1.7, color: GREEN });
        page.drawText(badge, { x: nameX + 24, y: badgeY + 7, size: 10.5, font: bold, color: rgb(1, 1, 1) });
        badgeBottom = badgeY - 14;
      }

      rowY = Math.min(photoBottom, badgeBottom) - 14;
      const rows: [string, string][] = [];
      if (person.mobile) rows.push(['Mobile', `+${String(person.mobile).replace(/^\+/, '')}`]);
      if (isVerified && person.whatsapp && person.whatsapp !== person.mobile) rows.push(['WhatsApp', `+${String(person.whatsapp).replace(/^\+/, '')}`]);
      if (person.email) rows.push(['Email', String(person.email)]);
      if (isVerified && person.partner_code) rows.push(['Promoter ID', String(person.partner_code)]);
      else if (person.member_code) rows.push(['Member ID', String(person.member_code)]);
      if (refCode && refCode !== person.member_code) rows.push(['Referral code', String(refCode)]);
      for (const [label, value] of rows) drawRow(label, value);

      rowY -= 2;
      page.drawText('REFERRAL LINK', { x: L, y: rowY, size: 8.5, font: bold, color: MUTED });
      page.drawText(referralLink, { x: valX, y: rowY, size: 9.5, font: helv, color: RED });
      if (isVerified) {
        rowY -= 18;
        page.drawText('DIGITAL V-CARD', { x: L, y: rowY, size: 8.5, font: bold, color: MUTED });
        page.drawText(vcardLink, { x: valX, y: rowY, size: 9.5, font: helv, color: RED });
      }

      // QR column — project page always; V-Card below for verified partners.
      const nextQrTop = qrBlock(shareLink, 'View this project', topY - 8);
      if (isVerified) qrBlock(vcardLink, 'My digital V-Card', nextQrTop - 6);
    }

    // footer
    page.drawRectangle({ x: 0, y: 0, width: W, height: 42, color: CHARCOAL });
    page.drawText(`${brand} · Helpdesk ${cfg.desk_phone ?? '+91 93848 18895'}`, { x: L, y: 25, size: 9.5, font: bold, color: rgb(1, 1, 1) });
    page.drawText(
      isCorporate
        ? `Official ${brand} brochure — generated fresh from live data.`
        : `This brochure was shared by ${person.name ?? 'a Jamin Bazaar member'} (${code}) via the ${brand} app.`,
      { x: L, y: 12, size: 7.5, font: helv, color: rgb(0.7, 0.7, 0.7) },
    );

    const out = await doc.save();
    const up = await svc.storage.from('property-media').upload(cachePath, out, { contentType: 'application/pdf', upsert: true });
    if (up.error) return redirect(original);

    await logDownload(isCorporate ? null : person.id);
    return redirect(STORAGE_PUBLIC + cachePath);
  } catch (_e) {
    // Never break a brochure download.
    return original ? redirect(original) : new Response('Brochure unavailable', { status: 500 });
  }
});
