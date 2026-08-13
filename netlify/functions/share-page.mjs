// Branded share/invite pages proxy (0053).
// Supabase Edge Functions force `text/html` responses to `text/plain` on their
// default domain (anti-phishing), which makes browsers render the page source
// as text. This thin Netlify Function fronts /s/* (project share) and /i/*
// (promoter invite), forwards to the Supabase `share` function, and restores
// the correct content type. POSTs (lead capture, WhatsApp intents) pass through.
const UPSTREAM = "https://zmxqozvivdluuxvvcegs.supabase.co/functions/v1";

/**
 * Shrink og:image / twitter:image through Supabase's render CDN.
 *
 * The invite page advertised a 990 KB cover photo. WhatsApp gives up on link
 * previews well before that, so shares arrived as a bare link with no picture
 * (owner report, 2026-07-31). The same file through the render endpoint is
 * ~227 KB at 1200x630, which is the size the og:image:width/height tags
 * already claim.
 *
 * Only Supabase *public storage* URLs are touched, and only inside the two
 * meta tags — never <img> tags, so the pages themselves still serve originals.
 */
function shrinkOgImages(html) {
  return html.replace(
    /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")([^"]+)(")/g,
    (all, head, url, tail) => {
      if (!url.includes("/storage/v1/object/public/")) return all;
      if (url.includes("/render/image/")) return all;
      const sized =
        url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
        (url.includes("?") ? "&" : "?") +
        "width=1200&height=630&resize=cover&quality=80";
      return head + sized + tail;
    },
  );
}

/**
 * 🚨 THE INVITE HERO IS PINNED TO THE BRAND BANNER (owner, 2026-08-13).
 *
 * The durable version of this lives in `supabase/functions/share/index.ts`,
 * which now builds the invite page with `${siteBase}/invite-card.jpg` instead of
 * "the first of this promoter's projects that happens to have a photo". That
 * file is committed. It is NOT yet deployed, because deploying a Supabase Edge
 * Function needs an access token this machine does not hold.
 *
 * So the swap is done here, in the proxy that already exists to fix up this
 * exact HTML (see `shrinkOgImages` above), and it is written to be IDEMPOTENT:
 * once the function is deployed it will already emit this URL, the replace will
 * find nothing to change, and the two agree rather than fight. There is no
 * drift to clean up — but the honest end state is the function owning it, and
 * this block can be deleted the day after that deploy.
 *
 * ⚠️ INVITE PAGES ONLY. A /s/ project page's hero SHOULD be that project's own
 * photograph; only the invite is a brand page. The caller passes `mode`.
 *
 * ⚠️ It rewrites the `<img>` inside `.hero` AND the two social meta tags, which
 * on the invite page are the same URL — so a WhatsApp preview and the page
 * itself cannot end up showing different pictures.
 */
const INVITE_HERO = "https://merry-begonia-4c3cd1.netlify.app/invite-card.jpg";

/**
 * 🚨 IT MATCHES PAST THE BRANDBAR, AND THAT IS THE WHOLE CORRECTNESS ARGUMENT.
 *
 * The hero block is `<div class="hero"><div class="brandbar"><img …logo.png…>
 * …</div><img …HERO…></div>`, so the FIRST `<img>` after `<div class="hero">`
 * is the 34px brand logo, not the picture. The first cut of this used a lazy
 * `[\s\S]*?<img src="([^"]+)"` and duly replaced the LOGO — which shipped, and
 * put a 1200px banner in the corner badge while the hero stayed on the old
 * project photo. It got through because the smoke test's sample had no logo
 * inside the brandbar; the fixture was simpler than the page.
 *
 * So the pattern is anchored on the brandbar's own closing tag and requires the
 * `</div>` that ends the hero. Any test for this must include the brandbar.
 */
function pinInviteHero(html) {
  const hero = html.match(/<div class="brandbar">[\s\S]*?<\/div>\s*<img src="([^"]+)"[^>]*>\s*<\/div>/);
  const current = hero?.[1];
  if (!current || current === INVITE_HERO) return html;
  /* Replace every occurrence, not just this one: og:image and twitter:image
     carry the same URL, and they have to move with the picture. */
  return html.split(current).join(INVITE_HERO);
}

export default async (req) => {
  const url = new URL(req.url);
  let segs = url.pathname.split("/").filter(Boolean);
  const k = segs.indexOf("share-page");
  if (k >= 0) segs = segs.slice(k + 1); // direct /.netlify/functions/share-page/... invocation
  const mode = segs[0]; // 's' | 'i'
  const rest = segs.slice(1).map(encodeURIComponent).join("/");
  if (!rest || (mode !== "s" && mode !== "i")) {
    return new Response("Not found", { status: 404 });
  }
  const target =
    (mode === "i" ? `${UPSTREAM}/share/invite/${rest}` : `${UPSTREAM}/share/${rest}`) + url.search;

  const init = { method: req.method, redirect: "manual", headers: {} };
  if (req.method === "POST") {
    init.headers["Content-Type"] = req.headers.get("content-type") ?? "application/json";
    init.body = await req.text();
  }
  const resp = await fetch(target, init);
  let body = await resp.arrayBuffer();
  const headers = new Headers();
  headers.set("Cache-Control", resp.headers.get("cache-control") ?? "public, max-age=0, s-maxage=60");
  if (resp.headers.get("location")) headers.set("Location", resp.headers.get("location"));
  const upstreamCt = resp.headers.get("content-type") ?? "";
  headers.set(
    "Content-Type",
    req.method === "GET" && upstreamCt.startsWith("text/plain")
      ? "text/html; charset=utf-8"
      : upstreamCt || "text/html; charset=utf-8"
  );

  // Only rewrite HTML we are actually serving as a page; never touch a POST
  // response or a binary body.
  if (req.method === "GET" && /text\/(html|plain)/.test(upstreamCt)) {
    let html = new TextDecoder().decode(body);
    /* Order matters: pin the invite hero FIRST, then let `shrinkOgImages` do
       its pass. The banner is served from this site rather than from Supabase
       storage, so that pass correctly leaves it alone — it is already sized for
       a link preview. */
    if (mode === "i") html = pinInviteHero(html);
    body = shrinkOgImages(html);
  }
  return new Response(body, { status: resp.status, headers });
};

export const config = { path: ["/s/*", "/i/*"] };
