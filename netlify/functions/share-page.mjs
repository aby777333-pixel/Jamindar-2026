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
    body = shrinkOgImages(new TextDecoder().decode(body));
  }
  return new Response(body, { status: resp.status, headers });
};

export const config = { path: ["/s/*", "/i/*"] };
