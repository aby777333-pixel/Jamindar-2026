// Jamindar — brochure personalization Edge Function (0053).
// GET /brochure/<propertyId>?ref=<JA-REF-xxxxx | JA-P-xxxx>[&src=whatsapp]
// Appends a promoter contact page to the project brochure (original pages are
// never modified), caches the result in property-media/personalized/, logs the
// download with promoter attribution, then 302-redirects to the PDF.
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

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
}

async function hashKey(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Draw a QR code as pure vector rectangles (no canvas/PNG needed). */
function drawQr(page: any, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = size / n;
  page.drawRectangle({ x: x - 6, y: y - 6, width: size + 12, height: size + 12, color: rgb(1, 1, 1), borderColor: GOLD, borderWidth: 1 });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: INK });
      }
    }
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
    const promoter = d.promoter;
    const cfg = d.config ?? {};
    const siteBase = cfg.site_base ?? 'https://merry-begonia-4c3cd1.netlify.app';

    // Anonymous / unverified refs get the original brochure (still attributed when possible).
    if (!promoter || !promoter.verified) {
      await svc.rpc('log_share_event', { p_ref: ref, p_property: propertyId, p_event: 'download', p_channel: channel });
      return redirect(original);
    }

    const code = (promoter.partner_code ?? promoter.referral_code) as string;
    const refCode = (promoter.referral_code ?? code) as string;
    const badge = cfg.badge_label ?? 'Verified Jamin Bazaar Partner';
    const brand = cfg.brand_name ?? 'Jamin Properties';
    const shareLink = `${siteBase}/s/${propertyId}?ref=${encodeURIComponent(refCode)}`;
    const vcardLink = `${siteBase}/card?c=${encodeURIComponent(code)}`;
    const referralLink = `${siteBase}/welcome?ref=${encodeURIComponent(refCode)}`;

    const ver = await hashKey([original, promoter.name, promoter.mobile, promoter.whatsapp, promoter.email, promoter.avatar_url, badge].join('|'));
    const cachePath = `personalized/${propertyId}/${code.replace(/[^A-Za-z0-9-]/g, '')}-${ver}.pdf`;

    const logDownload = () =>
      svc.from('brochure_downloads').insert({
        property_id: propertyId, user_id: null, promoter_id: promoter.id,
        ref_code: (ref || refCode).toUpperCase(), channel,
      });

    // Cache hit?
    const dir = cachePath.substring(0, cachePath.lastIndexOf('/'));
    const base = cachePath.substring(cachePath.lastIndexOf('/') + 1);
    const { data: listing } = await svc.storage.from('property-media').list(dir, { search: base });
    if ((listing ?? []).some((f: any) => f.name === base)) {
      await logDownload();
      return redirect(STORAGE_PUBLIC + cachePath);
    }

    // Build the personalized PDF.
    const srcBytes = new Uint8Array(await (await fetch(original)).arrayBuffer());
    const doc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    const last = doc.getPage(doc.getPageCount() - 1);
    const { width: W, height: H } = last.getSize();
    const page = doc.addPage([W, H]);
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Canvas
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
    // Header band
    const bandH = H * 0.135;
    page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: CHARCOAL });
    page.drawRectangle({ x: 0, y: H - bandH - 4, width: W, height: 4, color: GOLD });
    page.drawText(brand.toUpperCase(), { x: 40, y: H - bandH / 2 + 4, size: 24, font: bold, color: rgb(1, 1, 1) });
    page.drawText((cfg.tagline ?? 'Signature for Fortune'), { x: 40, y: H - bandH / 2 - 16, size: 11, font: helv, color: GOLD });
    page.drawText('YOUR PERSONAL PROPERTY PARTNER', { x: 40, y: H - bandH - 34, size: 13, font: bold, color: RED });

    let y = H - bandH - 60;
    const leftX = 40;

    // Avatar (best-effort)
    let avatarBottom = y;
    if (promoter.avatar_url) {
      try {
        const resp = await fetch(promoter.avatar_url);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
        const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const box = 110;
        const scale = Math.min(box / img.width, box / img.height);
        const iw = img.width * scale, ih = img.height * scale;
        page.drawRectangle({ x: leftX - 4, y: y - box - 4, width: box + 8, height: box + 8, color: rgb(1, 1, 1), borderColor: GOLD, borderWidth: 2 });
        page.drawImage(img, { x: leftX + (box - iw) / 2, y: y - box + (box - ih) / 2, width: iw, height: ih });
        avatarBottom = y - box - 12;
      } catch (_) { /* no avatar, no problem */ }
    }

    // Name + badge to the right of the avatar
    const nameX = promoter.avatar_url ? leftX + 130 : leftX;
    page.drawText(String(promoter.name ?? 'Jamin Partner'), { x: nameX, y: y - 26, size: 22, font: bold, color: INK });
    if (promoter.designation) {
      page.drawText(String(promoter.designation), { x: nameX, y: y - 44, size: 12, font: helv, color: MUTED });
    }
    // Verified badge pill with a drawn tick
    const badgeY = y - (promoter.designation ? 74 : 60);
    const badgeText = badge;
    const badgeW = bold.widthOfTextAtSize(badgeText, 11) + 40;
    page.drawRectangle({ x: nameX, y: badgeY, width: badgeW, height: 24, color: GREEN });
    page.drawCircle({ x: nameX + 13, y: badgeY + 12, size: 8, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: nameX + 9.5, y: badgeY + 12 }, end: { x: nameX + 12, y: badgeY + 8.5 }, thickness: 1.8, color: GREEN });
    page.drawLine({ start: { x: nameX + 12, y: badgeY + 8.5 }, end: { x: nameX + 17, y: badgeY + 15.5 }, thickness: 1.8, color: GREEN });
    page.drawText(badgeText, { x: nameX + 26, y: badgeY + 7, size: 11, font: bold, color: rgb(1, 1, 1) });

    // Contact rows
    y = Math.min(avatarBottom, badgeY) - 30;
    const rows: [string, string][] = [];
    if (promoter.mobile) rows.push(['Mobile', String(promoter.mobile)]);
    if (promoter.whatsapp) rows.push(['WhatsApp', String(promoter.whatsapp)]);
    if (promoter.email) rows.push(['Email', String(promoter.email)]);
    rows.push(['Promoter ID', code]);
    for (const [label, value] of rows) {
      page.drawText(label.toUpperCase(), { x: leftX, y, size: 9, font: bold, color: MUTED });
      page.drawText(value, { x: leftX + 100, y, size: 13, font: bold, color: INK });
      page.drawLine({ start: { x: leftX, y: y - 8 }, end: { x: W - 220, y: y - 8 }, thickness: 0.5, color: rgb(0.88, 0.85, 0.78) });
      y -= 30;
    }

    // Links
    y -= 6;
    page.drawText('DIGITAL V-CARD', { x: leftX, y, size: 9, font: bold, color: MUTED });
    page.drawText(vcardLink, { x: leftX + 100, y, size: 10, font: helv, color: RED });
    y -= 22;
    page.drawText('REFERRAL LINK', { x: leftX, y, size: 9, font: bold, color: MUTED });
    page.drawText(referralLink, { x: leftX + 100, y, size: 10, font: helv, color: RED });

    // QR (right column) — points at the promoter's branded share page
    const qrSize = 130;
    const qrX = W - qrSize - 48;
    const qrY = H - bandH - 80 - qrSize;
    drawQr(page, shareLink, qrX, qrY, qrSize);
    page.drawText('Scan to view this project', { x: qrX - 4, y: qrY - 22, size: 10, font: bold, color: INK });
    page.drawText('with my personal assistance', { x: qrX - 4, y: qrY - 35, size: 9, font: helv, color: MUTED });

    // Footer
    page.drawRectangle({ x: 0, y: 0, width: W, height: 46, color: CHARCOAL });
    page.drawText(`${brand} · Helpdesk ${cfg.desk_phone ?? '+91 93848 18895'}`, { x: 40, y: 27, size: 10, font: bold, color: rgb(1, 1, 1) });
    page.drawText(`This brochure was personalized for ${promoter.name} (${code}) via the Jamindar app.`, { x: 40, y: 12, size: 8, font: helv, color: rgb(0.7, 0.7, 0.7) });

    const out = await doc.save();
    const up = await svc.storage.from('property-media').upload(cachePath, out, { contentType: 'application/pdf', upsert: true });
    if (up.error) return redirect(original);

    await logDownload();
    return redirect(STORAGE_PUBLIC + cachePath);
  } catch (_e) {
    // Never break a brochure download.
    return original ? redirect(original) : new Response('Brochure unavailable', { status: 500 });
  }
});
