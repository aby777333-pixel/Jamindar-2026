// Public Community pages proxy (§5).
// Same reason as share-page.mjs: Supabase Edge Functions force `text/html`
// responses to `text/plain` on their default domain (anti-phishing), so a
// visitor would see the page source instead of the page. This thin Netlify
// Function fronts /c/* on the branded domain, forwards to the Supabase
// `community` function, and restores the correct content type.
//
//   /c                     → community index
//   /c/<postId>            → one post + its thread
//   /c/api/<endpoint>      → guest OTP / action API (POST, returns JSON)
//
// Query strings are preserved end to end — §9 referral attribution rides on
// ?ref= / ?utm_campaign=, and losing it here would silently orphan every lead.
const UPSTREAM = "https://zmxqozvivdluuxvvcegs.supabase.co/functions/v1";

/**
 * Shrink og:image / twitter:image through Supabase's render CDN — see the same
 * helper in share-page.mjs. A community post's first photo is whatever the
 * member uploaded, so it can easily be large enough that WhatsApp drops the
 * preview. Only Supabase public storage URLs inside those two meta tags are
 * touched; the page itself still loads the originals.
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
  const k = segs.indexOf("community-page");
  if (k >= 0) segs = segs.slice(k + 1); // direct /.netlify/functions/community-page/... call
  else if (segs[0] === "c") segs = segs.slice(1); // normal /c/... route

  const rest = segs.map(encodeURIComponent).join("/");
  const target = `${UPSTREAM}/community${rest ? "/" + rest : ""}${url.search}`;

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

  // Only rewrite HTML we are serving as a page — never the JSON guest API.
  if (req.method === "GET" && /text\/(html|plain)/.test(upstreamCt)) {
    body = shrinkOgImages(new TextDecoder().decode(body));
  }
  return new Response(body, { status: resp.status, headers });
};

export const config = { path: ["/c", "/c/*"] };
