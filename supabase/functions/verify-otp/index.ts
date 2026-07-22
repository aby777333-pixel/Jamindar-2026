// Deployed to Supabase project zmxqozvivdluuxvvcegs as `verify-otp` (verify_jwt = false).
// Validates the OTP, creates/gets the auth user, and returns session credentials which the
// client exchanges via signInWithPassword.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalize(m: string): string {
  const d = (m || "").replace(/[^0-9]/g, "");
  if (d.length === 10) return "91" + d;
  return d;
}
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randPass(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return "Jz" + [...a].map((b) => b.toString(36)).join("").slice(0, 30) + "!9";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { mobile, code } = await req.json();
    if (!mobile || !code) return json({ error: "mobile and code required" }, 400);
    const norm = normalize(mobile);
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
    const pepper = Deno.env.get("OTP_PEPPER") ?? "jamindar-pepper";

    const { data: rows, error: qErr } = await admin
      .from("otp_codes")
      .select("*")
      .eq("mobile", norm)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1);
    if (qErr) return json({ error: qErr.message }, 500);
    const row = rows?.[0];
    if (!row) return json({ error: "No active code. Request a new OTP." }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: "Code expired." }, 400);
    if (row.attempts >= 5) {
      await admin.from("otp_codes").update({ consumed: true }).eq("id", row.id);
      return json({ error: "Too many attempts." }, 429);
    }

    const hash = await sha256(String(code) + pepper);
    if (hash !== row.code_hash) {
      await admin.from("otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      return json({ error: "Incorrect code." }, 400);
    }
    await admin.from("otp_codes").update({ consumed: true }).eq("id", row.id);

    const email = `${norm}@phone.jamindar.app`;
    const password = randPass();

    let userId: string | null = null;
    let isNew = false;
    const { data: existing } = await admin.from("profiles").select("id").eq("mobile", norm).limit(1);
    if (existing && existing[0]) {
      userId = existing[0].id;
      await admin.auth.admin.updateUserById(userId, { password });
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { mobile: norm },
      });
      if (cErr || !created?.user) return json({ error: cErr?.message ?? "user create failed" }, 500);
      userId = created.user.id;
      isNew = true;
      await admin.from("profiles").insert({ id: userId, mobile: norm, role: "buyer", is_profile_complete: false });
    }
    await admin.from("profiles").update({ last_login: new Date().toISOString() }).eq("id", userId);
    return json({ verified: true, email, password, isNew, userId });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
