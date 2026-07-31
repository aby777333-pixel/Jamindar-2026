// Jamin Bazaar — public Community Edge Function (migration 0069).
//
// GET  /community                    → public community index (search + list)
// GET  /community/<postId>           → one post, its thread and pinned reply
// POST /community/api/otp-start      → { name, phone, email } → sends an OTP
// POST /community/api/otp-verify     → { phone, code, ... }   → guest session
// POST /community/api/act            → { token, action, ... } → reply / ask / lead
//
// Served on the branded domain through the Netlify proxy at /c/* (Supabase's
// own domain rewrites text/html to text/plain, which would show the source).
//
// Everything a visitor can do is gated on an OTP-verified guest session held
// server-side; the browser only ever holds an opaque token. Guest writes run
// through SECURITY DEFINER RPCs that are granted to NO client role, so the
// service-role key here is the only way in.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_BASE = Deno.env.get('SUPABASE_URL')!;
const svc = createClient(URL_BASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PEPPER = Deno.env.get('OTP_PEPPER') ?? 'jamindar-pepper';

const SITE = 'https://merry-begonia-4c3cd1.netlify.app';
const APP_STORE = 'https://merry-begonia-4c3cd1.netlify.app/welcome';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// ── helpers ────────────────────────────────────────────────────────────────
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function normalizePhone(m: string): string {
  const d = (m || '').replace(/[^0-9]/g, '');
  return d.length === 10 ? '91' + d : d;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=60' },
  });
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** First line of a post, used as a title/preview. */
function titleOf(body: string): string {
  const t = String(body || '').trim().split('\n')[0].trim();
  return t ? (t.length > 90 ? t.slice(0, 87) + '…' : t) : 'Jamin Community post';
}

// ── shared page chrome ─────────────────────────────────────────────────────
function shell(opts: {
  title: string; desc: string; image?: string | null; url: string; body: string; extraHead?: string;
}): string {
  const img = opts.image || `${SITE}/logo.png`;
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Jamin Bazaar Community">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(opts.url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(opts.title)}">
<meta name="twitter:description" content="${esc(opts.desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="${SITE}/logo-mark.png">
<style>
  :root{--brand:#E11B22;--gold:#E0A423;--navy:#141A2E;--ink:#15151B;--soft:#4B4B57;--faint:#86868B;
        --bg:#F1F2F6;--card:#fff;--line:#E7E8EE;--ok:#14A05A;--r:16px}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:16px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       -webkit-font-smoothing:antialiased}
  a{color:var(--brand)}
  .wrap{max-width:720px;margin:0 auto;padding:0 14px 56px}
  header.top{background:var(--navy);color:#fff;padding:14px 0;margin-bottom:16px}
  header.top .wrap{display:flex;align-items:center;gap:10px;padding-bottom:0}
  header.top img{height:30px;width:auto;border-radius:6px}
  header.top b{font-size:16px;letter-spacing:.2px}
  header.top span{margin-left:auto;font-size:12px;color:#9AA1B4}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin-bottom:12px}
  .who{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .av{width:38px;height:38px;border-radius:50%;background:var(--navy);color:#fff;display:flex;
      align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:0 0 auto}
  .nm{font-weight:700;font-size:14px}
  .mut{color:var(--faint);font-size:12px}
  .body{white-space:pre-wrap;word-wrap:break-word;font-size:15px;margin:2px 0 10px}
  .media{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:10px}
  .media img,.media video{width:100%;border-radius:12px;display:block;background:#E9EAEF}
  .file{display:flex;align-items:center;gap:8px;background:#F6F7FA;border-radius:12px;padding:11px;
        font-size:13.5px;font-weight:600;text-decoration:none;color:var(--ink)}
  .row{display:flex;align-items:center;gap:16px;color:var(--soft);font-size:13px;font-weight:600}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:0;cursor:pointer;
       border-radius:12px;padding:12px 16px;font:inherit;font-weight:700;font-size:14px}
  .btn-primary{background:var(--brand);color:#fff;width:100%}
  .btn-ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}
  .btn-gold{background:var(--gold);color:#1B1405}
  .btn:disabled{opacity:.55;cursor:not-allowed}
  .pin{border:1px solid var(--brand);background:#FDECEC}
  .pin .tag{color:var(--brand);font-weight:800;font-size:11px;letter-spacing:.4px;margin-bottom:4px}
  .cmt{border-top:1px solid var(--line);padding-top:12px;margin-top:12px}
  .cmt.reply{margin-left:16px;border-left:2px solid var(--line);border-top:0;padding:8px 0 0 12px;margin-top:8px}
  input,textarea{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:12px;
                 background:#fff;color:var(--ink)}
  textarea{min-height:96px;resize:vertical}
  label.ck{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--soft);line-height:1.45}
  label.ck input{width:18px;height:18px;flex:0 0 auto;margin-top:1px}
  .share{display:flex;flex-wrap:wrap;gap:8px}
  .share a,.share button{flex:1 1 auto;min-width:104px;text-align:center;text-decoration:none;
       border:1px solid var(--line);background:#fff;border-radius:11px;padding:10px;font-size:13px;
       font-weight:700;color:var(--ink);cursor:pointer}
  .note{font-size:12px;color:var(--faint)}
  .ok{color:var(--ok);font-weight:700}
  .err{color:var(--brand);font-weight:600;font-size:13px}
  dialog{border:0;border-radius:18px;padding:0;max-width:440px;width:calc(100% - 28px)}
  dialog::backdrop{background:rgba(0,0,0,.45)}
  .dlg{padding:18px;display:grid;gap:10px}
  h1{font-size:19px;margin:0 0 4px}
  h2{font-size:15px;margin:18px 0 8px}
  .hide{display:none!important}
  /* Persistent, non-intrusive join prompt. Docked, never a modal, never
     covering the reply controls — .wrap gets matching bottom padding. */
  .joinbar{position:fixed;left:0;right:0;bottom:0;z-index:60;background:var(--navy);color:#fff;
           border-top:2px solid var(--gold);box-shadow:0 -8px 26px rgba(0,0,0,.20)}
  .joinbar .in{max-width:720px;margin:0 auto;padding:10px 14px}
  .joinbar .pill{display:flex;align-items:center;gap:10px}
  .joinbar .mark{width:30px;height:30px;border-radius:8px;background:var(--gold);color:#1B1405;
                 display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;flex:0 0 auto}
  .joinbar b{font-size:14px;display:block;line-height:1.25}
  .joinbar .sub{font-size:11.5px;color:#B9C0D2}
  .joinbar .acts{margin-left:auto;display:flex;gap:6px;align-items:center;flex:0 0 auto}
  .joinbar .mini{background:var(--gold);color:#1B1405;border:0;border-radius:10px;padding:9px 13px;
                 font:inherit;font-weight:800;font-size:13px;cursor:pointer;text-decoration:none}
  .joinbar .ghost{background:transparent;color:#B9C0D2;border:1px solid #38405C;border-radius:10px;
                  padding:8px 10px;font:inherit;font-size:12px;cursor:pointer}
  .joinbar ul{margin:10px 0 0;padding:0 0 0 2px;list-style:none;display:grid;gap:6px;
              grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
  .joinbar li{font-size:12.5px;color:#D8DCE8;display:flex;gap:7px;align-items:flex-start}
  .joinbar li span{color:var(--gold);font-weight:900;flex:0 0 auto}
  body.hasjoin .wrap{padding-bottom:150px}
</style>${opts.extraHead ?? ''}</head>
<body>
<header class="top"><div class="wrap">
  <img src="${SITE}/logo-mark.png" alt="">
  <b>Jamin Community</b><span>Open to everyone</span>
</div></header>
<div class="wrap">${opts.body}</div>

<div class="joinbar hide" id="joinbar"><div class="in">
  <div class="pill">
    <div class="mark">J</div>
    <div><b>Join Jamin Bazaar</b><span class="sub" id="joinSub">Free — keep this conversation and pick up anywhere.</span></div>
    <div class="acts">
      <button class="ghost" id="joinMore" aria-expanded="false">Why?</button>
      <a class="mini" id="joinGo" href="${APP_STORE}">Join</a>
      <button class="ghost" id="joinX" aria-label="Dismiss">✕</button>
    </div>
  </div>
  <ul class="hide" id="joinList">
    <li><span>✓</span>Save your favourite properties</li>
    <li><span>✓</span>Track enquiries and conversations</li>
    <li><span>✓</span>Book site visits</li>
    <li><span>✓</span>Connect directly with verified promoters</li>
    <li><span>✓</span>Get instant property updates</li>
    <li><span>✓</span>Access exclusive listings and offers</li>
    <li><span>✓</span>Continue conversations across devices</li>
  </ul>
</div></div>

<script>
(function(){
  var KEY='jaminJoinSnooze', SNOOZE=86400000; // a dismissal lasts a day, not forever
  var bar=document.getElementById('joinbar'), list=document.getElementById('joinList'),
      more=document.getElementById('joinMore'), go=document.getElementById('joinGo');
  if(!bar) return;

  // Carry the visitor back to exactly this page after registering, and keep the
  // referral/campaign query so §9 attribution is not lost at the hand-off.
  try{ go.href=${JSON.stringify(APP_STORE)}+'?next='+encodeURIComponent(location.href); }catch(e){}

  function snoozedUntil(){ try{ return parseInt(localStorage.getItem(KEY)||'0',10)||0 }catch(e){ return 0 } }
  function show(){ bar.classList.remove('hide'); document.body.classList.add('hasjoin') }
  function hide(){ bar.classList.add('hide'); document.body.classList.remove('hasjoin') }

  if(Date.now() > snoozedUntil()) show();

  more.onclick=function(){
    var open=list.classList.toggle('hide')===false;
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? 'Hide' : 'Why?';
  };
  document.getElementById('joinX').onclick=function(){
    try{ localStorage.setItem(KEY, String(Date.now()+SNOOZE)) }catch(e){}
    hide();
  };

  // Reappears after meaningful engagement (a reply, a question, an enquiry) —
  // a dismissal should not silence it once the visitor is clearly invested.
  window.jaminJoinNudge=function(msg){
    try{ localStorage.removeItem(KEY) }catch(e){}
    if(msg) document.getElementById('joinSub').textContent=msg;
    show(); list.classList.remove('hide');
    more.setAttribute('aria-expanded','true'); more.textContent='Hide';
  };
})();
</script>
</body></html>`;
}

function mediaHtml(media: any[]): string {
  if (!Array.isArray(media) || !media.length) return '';
  const imgs = media.filter((m) => m?.type === 'image');
  const vids = media.filter((m) => m?.type === 'video');
  const files = media.filter((m) => m?.type === 'pdf' || m?.type === 'file');
  const auds = media.filter((m) => m?.type === 'audio');
  let out = '';
  if (imgs.length || vids.length) {
    out += `<div class="media">${
      imgs.map((m) => `<img loading="lazy" src="${esc(m.url)}" alt="">`).join('') +
      vids.map((m) => `<video controls preload="metadata" src="${esc(m.url)}"></video>`).join('')
    }</div>`;
  }
  out += auds.map((m) => `<audio controls src="${esc(m.url)}" style="width:100%;margin-bottom:8px"></audio>`).join('');
  out += files
    .map((m) => `<a class="file" href="${esc(m.url)}" target="_blank" rel="noopener">📄 ${esc(m.name || 'Document')}</a>`)
    .join('');
  return out;
}

const initials = (n: string) =>
  (n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// ── GET: index ─────────────────────────────────────────────────────────────
async function pageIndex(url: URL): Promise<Response> {
  const q = url.searchParams.get('q') ?? '';
  const { data } = await svc.rpc('community_public_feed', { p_limit: 30, p_before: null, p_q: q || null });
  const posts: any[] = data ?? [];
  const qs = url.search; // keep ?ref= / ?utm_campaign= on every link (§9)

  const list = posts.length
    ? posts.map((p) => `<a class="card" style="display:block;text-decoration:none;color:inherit"
         href="/c/${esc(p.id)}${esc(qs)}">
        <div class="who"><div class="av">${esc(initials(p.author?.name))}</div>
          <div><div class="nm">${esc(p.author?.name)}</div>
          <div class="mut">${esc(timeAgo(p.created_at))}</div></div></div>
        <div class="body">${esc(p.body).slice(0, 320)}${String(p.body || '').length > 320 ? '…' : ''}</div>
        ${mediaHtml(p.media)}
        <div class="row"><span>♥ ${p.likes ?? 0}</span><span>💬 ${p.comments ?? 0}</span>
        <span style="margin-left:auto;color:var(--brand)">Open →</span></div>
      </a>`).join('')
    : `<div class="card"><b>Nothing here yet.</b><div class="mut" style="margin-top:6px">
         ${q ? 'No posts match that search.' : 'The community has no public posts at the moment.'}</div></div>`;

  return html(shell({
    title: 'Jamin Community — property talk, open to everyone',
    desc: 'Read what Jamin buyers, promoters and the Jamin team are discussing. No app or account needed.',
    url: `${SITE}/c`,
    body: `
      <form method="get" action="/c" style="display:flex;gap:8px;margin-bottom:14px">
        <input name="q" value="${esc(q)}" placeholder="Search discussions…" aria-label="Search discussions">
        ${[...url.searchParams].filter(([k]) => k !== 'q')
          .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('')}
        <button class="btn btn-ghost" type="submit">Search</button>
      </form>
      ${list}
      <div class="card" style="text-align:center">
        <b>Want to post, reply or enquire?</b>
        <div class="mut" style="margin:6px 0 12px">Replying takes a name, a phone number and one OTP — no account needed.</div>
        <a class="btn btn-gold" href="${APP_STORE}">Get the Jamin Bazaar app</a>
      </div>`,
  }));
}

// ── GET: one post ──────────────────────────────────────────────────────────
async function pagePost(id: string, url: URL): Promise<Response> {
  const { data } = await svc.rpc('community_public_post', { p_id: id });
  if (!data) {
    return html(shell({
      title: 'Post unavailable — Jamin Community',
      desc: 'This community post is not available publicly.',
      url: `${SITE}/c/${id}`,
      body: `<div class="card"><b>This post isn't available.</b>
        <div class="mut" style="margin-top:6px">It may have been removed, or it is visible to Jamin members only.</div>
        <div style="margin-top:12px"><a class="btn btn-ghost" href="/c">← Back to the community</a></div></div>`,
    }), 404);
  }

  const post: any = data;
  const comments: any[] = post.comments_list ?? [];
  const pinnedId = post.pinned_comment_id;
  const byId = new Map(comments.map((c) => [c.id, c]));
  const roots = comments.filter((c) => !c.parent_id || !byId.has(c.parent_id));
  const repliesOf = (rootId: string) =>
    comments.filter((c) => {
      let cur = c, guard = 0;
      while (cur?.parent_id && byId.has(cur.parent_id) && guard++ < 50) cur = byId.get(cur.parent_id);
      return cur?.id === rootId && c.id !== rootId;
    });

  const cmtHtml = (c: any, isReply: boolean) => `
    <div class="cmt${isReply ? ' reply' : ''}${c.id === pinnedId ? ' pin' : ''}"
         ${c.id === pinnedId ? 'style="border-radius:12px;padding:12px"' : ''}>
      ${c.id === pinnedId ? `<div class="tag">📌 PINNED REPLY${post.pinned_by ? ` · pinned by ${esc(post.pinned_by)}` : ''}</div>` : ''}
      <div class="who" style="margin-bottom:4px">
        <div class="av" style="width:30px;height:30px;font-size:11px">${esc(initials(c.author?.name))}</div>
        <div><div class="nm">${esc(c.author?.name)}${c.is_admin_reply ? ' <span style="background:var(--brand);color:#fff;border-radius:99px;padding:1px 6px;font-size:9.5px">ADMIN</span>' : ''}</div>
        <div class="mut">${esc(timeAgo(c.created_at))}${c.edited ? ' · Edited' : ''}</div></div>
      </div>
      ${c.reply_to_name ? `<div class="mut" style="margin-bottom:3px">Replying to ${esc(c.reply_to_name)}</div>` : ''}
      <div class="body" style="margin:0 0 6px">${esc(c.body)}</div>
      ${post.comments_locked ? '' :
        `<button class="btn btn-ghost" style="padding:6px 10px;font-size:12px"
                 onclick="startAction('reply','${esc(c.id)}','${esc(c.author?.name)}')">Reply</button>`}
    </div>`;

  // pinned thread first (§3)
  const ordered = [...roots].sort((a, b) => {
    const ap = a.id === pinnedId || repliesOf(a.id).some((r: any) => r.id === pinnedId);
    const bp = b.id === pinnedId || repliesOf(b.id).some((r: any) => r.id === pinnedId);
    return ap === bp ? 0 : ap ? -1 : 1;
  });

  const thread = ordered.length
    ? ordered.map((c) => cmtHtml(c, false) + repliesOf(c.id).map((r) => cmtHtml(r, true)).join('')).join('')
    : `<div class="mut" style="padding-top:10px">No replies yet — be the first.</div>`;

  const shareUrl = `${SITE}/c/${id}${url.search}`;
  const shareText = `${titleOf(post.body)} — Jamin Community`;

  return html(shell({
    title: `${titleOf(post.body)} — Jamin Community`,
    desc: String(post.body || '').replace(/\s+/g, ' ').slice(0, 180) || 'A discussion on Jamin Community.',
    image: (post.media ?? []).find((m: any) => m?.type === 'image')?.url ?? null,
    url: shareUrl,
    body: `
      <div class="card">
        <div class="who"><div class="av">${esc(initials(post.author?.name))}</div>
          <div><div class="nm">${esc(post.author?.name)}</div>
          <div class="mut">${esc(timeAgo(post.created_at))}</div></div></div>
        <div class="body">${esc(post.body)}</div>
        ${mediaHtml(post.media)}
        ${(post.links ?? []).map((l: string) => `<div><a href="${esc(l)}" target="_blank" rel="noopener nofollow">${esc(l)}</a></div>`).join('')}
        <div class="row" style="margin-top:10px"><span>♥ ${post.likes ?? 0}</span><span>💬 ${comments.length}</span></div>
      </div>

      <div class="card">
        <b>Share this post</b>
        <div class="mut" style="margin:4px 0 10px">The link keeps track of who shared it.</div>
        <div class="share">
          <button onclick="copyLink()">🔗 Copy link</button>
          <a href="https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}" target="_blank" rel="noopener">WhatsApp</a>
          <a href="sms:?&body=${encodeURIComponent(shareText + ' ' + shareUrl)}">SMS</a>
          <a href="mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareUrl)}">Email</a>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">Facebook</a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">LinkedIn</a>
          <button onclick="nativeShare()" id="nativeShareBtn" class="hide">📱 Share…</button>
        </div>
      </div>

      <div class="card">
        <b>Talk to the Jamin team</b>
        <div class="mut" style="margin:4px 0 10px">Verified with one OTP. No account, no app install.</div>
        <div class="share">
          <button onclick="startAction('ask_admin')">Ask Admin</button>
          <button onclick="startAction('express_interest')">I'm interested</button>
          <button onclick="startAction('request_callback')">Request a callback</button>
          <button onclick="startAction('enquiry')">Start an enquiry</button>
        </div>
      </div>

      <h2>Replies (${comments.length})</h2>
      <div class="card">
        ${post.comments_locked ? '<div class="mut">🔒 Replies are closed on this post.</div>' : ''}
        ${thread}
        ${post.comments_locked ? '' :
          `<div style="margin-top:14px"><button class="btn btn-primary" onclick="startAction('reply')">Write a reply</button></div>`}
      </div>

      <div class="card" style="text-align:center">
        <a class="btn btn-gold" href="${APP_STORE}">Get the Jamin Bazaar app</a>
        <div class="note" style="margin-top:8px">Save properties, track replies, book site visits.</div>
      </div>

      <dialog id="dlg"><form method="dialog" class="dlg" id="dlgForm">
        <div id="step1">
          <h1 id="dlgTitle">Verify to continue</h1>
          <div class="mut" id="dlgSub">Your details stay private — they are never shown in the community.</div>
          <div style="display:grid;gap:8px;margin-top:10px">
            <input id="gName" placeholder="Your name" autocomplete="name" required>
            <input id="gPhone" placeholder="10-digit mobile number" inputmode="numeric" autocomplete="tel" required>
            <input id="gEmail" type="email" placeholder="Email address" autocomplete="email" required>
            <label class="ck"><input type="checkbox" id="gConsent">
              <span>I agree to receive property updates, offers, and follow-up communication from Jamin
              through phone, WhatsApp, SMS, or email.</span></label>
            <div class="note">Leaving this unticked is fine — you can still reply and enquire.</div>
            <div class="err hide" id="err1"></div>
            <button type="button" class="btn btn-primary" id="btnSend">Send OTP</button>
          </div>
        </div>
        <div id="step2" class="hide">
          <h1>Enter the code</h1>
          <div class="mut">We sent a 6-digit code by SMS/WhatsApp. It expires in 10 minutes.</div>
          <div style="display:grid;gap:8px;margin-top:10px">
            <input id="gCode" placeholder="6-digit OTP" inputmode="numeric" maxlength="6">
            <div class="err hide" id="err2"></div>
            <button type="button" class="btn btn-primary" id="btnVerify">Verify</button>
            <button type="button" class="btn btn-ghost" id="btnBack">Back</button>
          </div>
        </div>
        <div id="step3" class="hide">
          <h1 id="actTitle">Your message</h1>
          <div class="mut" id="actSub"></div>
          <div style="display:grid;gap:8px;margin-top:10px">
            <textarea id="actText" placeholder="Type your message…"></textarea>
            <div class="err hide" id="err3"></div>
            <button type="button" class="btn btn-primary" id="btnAct">Send</button>
          </div>
        </div>
        <div id="step4" class="hide" style="text-align:center">
          <h1 class="ok">✓ Done</h1>
          <div class="mut" id="doneMsg"></div>
          <div style="display:grid;gap:8px;margin-top:12px">
            <a class="btn btn-gold" href="${APP_STORE}">Create my free Jamin account</a>
            <button type="button" class="btn btn-ghost" id="btnClose">No thanks, continue reading</button>
          </div>
        </div>
      </form></dialog>

      <script>
      var POST_ID=${JSON.stringify(id)};
      var QS=${JSON.stringify(url.search)};
      var TOKEN=null; try{TOKEN=localStorage.getItem('jaminGuestToken')}catch(e){}
      var action='reply', parentId=null, parentName=null;
      var $=function(s){return document.getElementById(s)};
      if(navigator.share) $('nativeShareBtn').classList.remove('hide');

      function copyLink(){
        var u=location.href;
        (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject())
          .then(function(){alert('Link copied')})
          .catch(function(){prompt('Copy this link', u)});
      }
      function nativeShare(){
        navigator.share({title:document.title,url:location.href}).catch(function(){});
      }

      var LABELS={
        reply:['Reply to this post','Your reply appears publicly under this post.'],
        ask_admin:['Ask Admin','Goes to the Jamin team with this post attached. Your contact stays private.'],
        express_interest:['Register your interest','Tell us what interests you and the team will follow up.'],
        request_callback:['Request a callback','When is a good time to call?'],
        enquiry:['Start an enquiry','Tell us what you are looking for.']
      };

      function startAction(a, pid, pname){
        action=a; parentId=pid||null; parentName=pname||null;
        var L=LABELS[a]||LABELS.reply;
        $('actTitle').textContent=L[0];
        $('actSub').textContent=parentName?('Replying to '+parentName):L[1];
        $('actText').placeholder=(a==='ask_admin')?'What would you like to know?':'Type your message…';
        show(TOKEN?'step3':'step1');
        $('dlg').showModal();
      }
      function show(step){
        ['step1','step2','step3','step4'].forEach(function(s){
          $(s).classList.toggle('hide', s!==step);
        });
        ['err1','err2','err3'].forEach(function(e){$(e).classList.add('hide')});
      }
      function fail(id,msg){var e=$(id);e.textContent=msg;e.classList.remove('hide')}

      function api(path, payload){
        return fetch('/c/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},
               body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(j){
                 if(!r.ok) throw new Error(j.error||'Something went wrong'); return j;})});
      }

      $('btnSend').onclick=function(){
        var b=this; var phone=$('gPhone').value.replace(/[^0-9]/g,'');
        if(!$('gName').value.trim()) return fail('err1','Please enter your name');
        if(phone.length<10) return fail('err1','Enter a valid 10-digit mobile number');
        if(!/.+@.+\\..+/.test($('gEmail').value)) return fail('err1','Enter a valid email address');
        b.disabled=true; b.textContent='Sending…';
        api('otp-start',{phone:phone}).then(function(){show('step2')})
          .catch(function(e){fail('err1',e.message)})
          .finally(function(){b.disabled=false;b.textContent='Send OTP'});
      };
      $('btnBack').onclick=function(){show('step1')};
      $('btnVerify').onclick=function(){
        var b=this; b.disabled=true; b.textContent='Verifying…';
        api('otp-verify',{
          phone:$('gPhone').value.replace(/[^0-9]/g,''), code:$('gCode').value.trim(),
          name:$('gName').value.trim(), email:$('gEmail').value.trim(),
          consent:$('gConsent').checked, postId:POST_ID,
          sourceUrl:location.href, query:QS
        }).then(function(j){
          TOKEN=j.token; try{localStorage.setItem('jaminGuestToken',TOKEN)}catch(e){}
          show('step3');
        }).catch(function(e){fail('err2',e.message)})
          .finally(function(){b.disabled=false;b.textContent='Verify'});
      };
      $('btnAct').onclick=function(){
        var b=this; var text=$('actText').value.trim();
        if(!text && action!=='express_interest') return fail('err3','Please type a message');
        b.disabled=true; b.textContent='Sending…';
        api('act',{token:TOKEN,action:action,postId:POST_ID,parentId:parentId,
                   message:text,sourceUrl:location.href})
          .then(function(j){
            $('doneMsg').textContent=j.message||'Thank you.';
            show('step4');
            // §8 — the visitor just engaged, so surface the join prompt again
            // (clearing any earlier dismissal) without blocking what they did.
            try{ window.jaminJoinNudge && window.jaminJoinNudge(
              'Keep track of this — save it to a free Jamin account.') }catch(e){}
            if(action==='reply') setTimeout(function(){location.reload()},2500);
          })
          .catch(function(e){
            if(/session/i.test(e.message)){TOKEN=null;try{localStorage.removeItem('jaminGuestToken')}catch(_){ } show('step1');}
            else fail('err3',e.message);
          })
          .finally(function(){b.disabled=false;b.textContent='Send'});
      };
      $('btnClose').onclick=function(){$('dlg').close()};
      </script>`,
  }));
}

// ── POST: guest API ────────────────────────────────────────────────────────
async function apiOtpStart(body: any): Promise<Response> {
  const phone = normalizePhone(body?.phone ?? '');
  if (phone.length < 10) return json({ error: 'Enter a valid mobile number' }, 400);
  // Reuse the app's OTP sender: same DLT template, same rate limits (§11).
  const r = await fetch(`${URL_BASE}/functions/v1/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: phone }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: j?.error ?? 'Could not send the code' }, r.status);
  return json({ ok: true });
}

async function apiOtpVerify(body: any): Promise<Response> {
  const phone = normalizePhone(body?.phone ?? '');
  const code = String(body?.code ?? '').trim();
  if (!phone || !code) return json({ error: 'Mobile and code are required' }, 400);

  const { data: rows } = await svc.from('otp_codes').select('*')
    .eq('mobile', phone).eq('consumed', false)
    .order('created_at', { ascending: false }).limit(1);
  const row = rows?.[0];
  if (!row) return json({ error: 'No active code. Request a new OTP.' }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'Code expired.' }, 400);
  if ((row.attempts ?? 0) >= 5) {
    await svc.from('otp_codes').update({ consumed: true }).eq('id', row.id);
    return json({ error: 'Too many attempts.' }, 429);
  }
  if ((await sha256(code + PEPPER)) !== row.code_hash) {
    await svc.from('otp_codes').update({ attempts: (row.attempts ?? 0) + 1 }).eq('id', row.id);
    return json({ error: 'Incorrect code.' }, 400);
  }
  await svc.from('otp_codes').update({ consumed: true }).eq('id', row.id);

  // §9 — attribution comes off the share link the visitor arrived on.
  const q = new URLSearchParams(String(body?.query ?? ''));
  const { data: guestId, error } = await svc.rpc('community_guest_upsert', {
    p_name: String(body?.name ?? '').slice(0, 120),
    p_phone: phone,
    p_email: String(body?.email ?? '').slice(0, 160),
    p_source_url: String(body?.sourceUrl ?? '').slice(0, 500),
    p_campaign: q.get('utm_campaign') ?? q.get('campaign'),
    p_referral_code: q.get('ref') ?? q.get('r'),
    p_post: body?.postId ?? null,
  });
  if (error) return json({ error: error.message }, 400);

  // §7 — record the consent decision either way, never assume it.
  await svc.rpc('community_guest_consent', {
    p_guest: guestId, p_consent: !!body?.consent, p_source_url: String(body?.sourceUrl ?? ''),
  });

  const token = crypto.randomUUID() + '.' + crypto.randomUUID();
  await svc.from('community_guest_sessions').insert({
    guest_id: guestId,
    token_hash: await sha256(token + PEPPER),
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
  return json({ ok: true, token });
}

async function guestFromToken(token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await svc.from('community_guest_sessions')
    .select('guest_id, expires_at').eq('token_hash', await sha256(token + PEPPER)).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.guest_id as string;
}

async function apiAct(body: any): Promise<Response> {
  const guest = await guestFromToken(String(body?.token ?? ''));
  if (!guest) return json({ error: 'Your session expired — please verify again.' }, 401);

  const action = String(body?.action ?? '');
  const postId = body?.postId ?? null;
  const message = String(body?.message ?? '').slice(0, 4000);
  const sourceUrl = String(body?.sourceUrl ?? '').slice(0, 500);

  if (action === 'reply') {
    const { error } = await svc.rpc('community_guest_comment', {
      p_guest: guest, p_post: postId, p_body: message, p_parent: body?.parentId ?? null,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, message: 'Your reply is now on the post.' });
  }

  if (action === 'ask_admin') {
    const { error } = await svc.rpc('community_guest_ask', {
      p_guest: guest, p_post: postId, p_question: message,
    });
    if (error) return json({ error: error.message }, 400);
    // an admin question is also an enquiry worth tracking (§7)
    await svc.rpc('community_guest_lead', {
      p_guest: guest, p_post: postId, p_action: 'ask_admin',
      p_message: message, p_property: null, p_source_url: sourceUrl,
    });
    return json({ ok: true, message: 'The Jamin team has your question. Their answer appears under this post.' });
  }

  if (['express_interest', 'request_callback', 'enquiry'].includes(action)) {
    const { error } = await svc.rpc('community_guest_lead', {
      p_guest: guest, p_post: postId, p_action: action,
      p_message: message || null, p_property: body?.propertyId ?? null, p_source_url: sourceUrl,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, message: 'Your enquiry has been submitted. The Jamin team will contact you shortly.' });
  }

  return json({ error: 'Unknown action' }, 400);
}

// ── router ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  let segs = url.pathname.split('/').filter(Boolean);
  const k = segs.indexOf('community');
  if (k >= 0) segs = segs.slice(k + 1);

  try {
    if (req.method === 'POST' && segs[0] === 'api') {
      const body = await req.json().catch(() => ({}));
      if (segs[1] === 'otp-start') return await apiOtpStart(body);
      if (segs[1] === 'otp-verify') return await apiOtpVerify(body);
      if (segs[1] === 'act') return await apiAct(body);
      return json({ error: 'Unknown endpoint' }, 404);
    }
    if (req.method === 'GET') {
      if (!segs.length) return await pageIndex(url);
      if (/^[0-9a-f-]{36}$/i.test(segs[0])) return await pagePost(segs[0], url);
      return html(shell({
        title: 'Not found — Jamin Community', desc: 'Page not found.',
        url: `${SITE}/c`,
        body: `<div class="card"><b>Page not found.</b>
          <div style="margin-top:12px"><a class="btn btn-ghost" href="/c">← Back to the community</a></div></div>`,
      }), 404);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: (e as Error)?.message ?? 'Server error' }, 500);
  }
});
