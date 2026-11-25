// Supabase Edge Function: admin
// One admin, one password. No Supabase Auth users, no email, no admins table.
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   ADMIN_PASSWORD   required, at least 12 characters
//   ADMIN_USERNAME   optional, defaults to "admin"
// SUPABASE_URL and the Supabase secret key are provided automatically.
//
// The admin page signs in once (action "login"), receives a token that lasts 12 hours,
// and sends that token with every later request (actions "list" and "export").

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const EVENT_DAYS = ["2026-12-04", "2026-12-05", "2026-12-06"];
const COLUMNS = "ticket_code, full_name, email, phone, days, created_at";
const PAGE_SIZE = 50;
const EXPORT_CAP = 20000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILS = 8;                    // wrong logins allowed per network...
const FAIL_WINDOW_MS = 15 * 60 * 1000;  // ...in this window (best effort, per server instance)
const FAIL_DELAY_MS = 1000;             // every wrong guess is answered one second late

// Supabase is replacing the old "service_role" key with "secret" keys (sb_secret_...).
// Use the new key when the project has one, and fall back to the old variable otherwise,
// so this works on newer and older projects alike.
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const key = keys["default"] ?? Object.values(keys)[0];
    if (typeof key === "string" && key) return key;
  } catch { /* variable missing or not JSON: use the old one */ }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  console.error("No Supabase secret key found in the function environment.");
  return "no-key-configured";
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  secretKey(),
  { auth: { persistSession: false } },
);

const enc = new TextEncoder();
const fails = new Map<string, { n: number; first: number }>();

const cors = {
  // The password is the protection here, so any site may call this; nothing works without it.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- crypto helpers (constant-time comparison, signed tokens) ----------
async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
// Compares hashes of both values, so timing never reveals how much of a guess was right
async function sameText(a: string, b: string): Promise<boolean> {
  return bytesEqual(await sha256(a), await sha256(b));
}
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function signingKey(username: string, password: string) {
  const raw = await sha256(`iidmf-admin-v1|${username}|${password}`);
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function sign(exp: number, key: CryptoKey): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(String(exp)))));
}
async function makeToken(username: string, password: string): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${await sign(exp, await signingKey(username, password))}`;
}
// Changing the password changes the signing key, which logs everyone out
async function tokenValid(token: unknown, username: string, password: string): Promise<boolean> {
  if (typeof token !== "string" || token.length > 200) return false;
  const [expText, sig] = token.split(".");
  const exp = Number(expText);
  if (!Number.isFinite(exp) || !sig) return false;
  const now = Date.now();
  if (exp <= now || exp > now + TOKEN_TTL_MS + 60_000) return false;
  return sameText(sig, await sign(exp, await signingKey(username, password)));
}

// ---------- data helpers ----------
function cleanSearch(v: unknown): string {
  // characters that would break the PostgREST filter syntax
  return String(v ?? "").replace(/[,()*%\\:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
// deno-lint-ignore no-explicit-any
function filtered(query: any, search: string, day: string) {
  if (day) query = query.contains("days", [day]);
  if (search) {
    const digits = search.replace(/\D/g, "");
    const parts = [`full_name.ilike.*${search}*`, `email.ilike.*${search}*`, `ticket_code.ilike.*${search}*`];
    if (digits.length >= 3) parts.push(`phone.ilike.*${digits}*`);
    query = query.or(parts.join(","));
  }
  return query;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // Fail closed: no strong password set means nobody gets in
  const username = (Deno.env.get("ADMIN_USERNAME") ?? "admin").trim().toLowerCase();
  const password = Deno.env.get("ADMIN_PASSWORD") ?? "";
  if (!username || password.length < 12) {
    return json({ error: "Admin login is not set up yet. Add the ADMIN_PASSWORD secret in Supabase (at least 12 characters)." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4000) return json({ error: "Request too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // ---------- sign in ----------
  if (body.action === "login") {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const now = Date.now();
    const rec = fails.get(ip);
    if (rec && now - rec.first > FAIL_WINDOW_MS) fails.delete(ip);
    const current = fails.get(ip);
    if (current && current.n >= MAX_FAILS) {
      return json({ error: "Too many wrong attempts. Please try again in 15 minutes." }, 429);
    }

    // Always check both, so the answer takes the same time whichever one was wrong
    const userOk = await sameText(String(body.username ?? "").trim().toLowerCase(), username);
    const passOk = await sameText(String(body.password ?? ""), password);
    if (!(userOk && passOk)) {
      if (fails.size > 5000) fails.clear();
      const f = fails.get(ip) ?? { n: 0, first: now };
      f.n++;
      fails.set(ip, f);
      await sleep(FAIL_DELAY_MS);
      return json({ error: "Wrong username or password." }, 401);
    }
    fails.delete(ip);
    return json({ token: await makeToken(username, password), expires_in_ms: TOKEN_TTL_MS });
  }

  // ---------- everything else needs a valid token ----------
  if (!(await tokenValid(body.token, username, password))) {
    return json({ error: "Your session has ended. Please sign in again." }, 401);
  }

  const search = cleanSearch(body.q);
  const day = typeof body.day === "string" && EVENT_DAYS.includes(body.day) ? body.day : "";

  if (body.action === "list") {
    const page = Math.max(0, Math.min(100000, Math.trunc(Number(body.page)) || 0));
    const from = page * PAGE_SIZE;
    const { data, count, error } = await filtered(
      supabase.from("registrations").select(COLUMNS, { count: "exact" }), search, day,
    ).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (error) { console.error("list", error); return json({ error: "Could not load registrations." }, 500); }

    let stats: unknown = undefined;
    if (body.stats === true) {
      const total = await supabase.from("registrations").select("id", { count: "exact", head: true });
      const by_day: Record<string, number> = {};
      for (const d of EVENT_DAYS) {
        const r = await supabase.from("registrations").select("id", { count: "exact", head: true }).contains("days", [d]);
        by_day[d] = r.count ?? 0;
      }
      stats = { registrations: total.count ?? 0, by_day };
    }
    return json({ rows: data ?? [], total: count ?? 0, page_size: PAGE_SIZE, stats });
  }

  if (body.action === "export") {
    const all: unknown[] = [];
    for (let from = 0; from < EXPORT_CAP; from += 1000) {
      const { data, error } = await filtered(
        supabase.from("registrations").select(COLUMNS), search, day,
      ).order("created_at", { ascending: true }).range(from, from + 999);
      if (error) { console.error("export", error); return json({ error: "Could not export." }, 500); }
      all.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
    return json({ rows: all });
  }

  return json({ error: "Unknown request." }, 400);
});
