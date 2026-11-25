// Supabase Edge Function: register
// Validates a festival registration, stores it, and returns the data needed
// to draw the invitation pass in the browser.
//
// Secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`):
//   ALLOWED_ORIGINS  comma-separated, e.g. "https://www.example.gov.in,https://example.gov.in"
//   IP_HASH_SALT     any long random string
// SUPABASE_URL and the Supabase secret key are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const EVENT_DAYS = ["2026-12-04", "2026-12-05", "2026-12-06"];
const RATE_LIMIT_PER_HOUR = 20; // per IP; generous because offices and colleges share IPs
const MIN_FILL_MS = 2500;       // humans take longer than this to fill the form
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

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

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = allowedOrigins.includes("*")
    ? "*"
    : origin && allowedOrigins.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function fail(message: string, status: number, origin: string | null, field?: string) {
  return json({ error: message, field }, status, origin);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ticketCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `IIDMF-${out}`;
}

function publicTicket(row: Record<string, unknown>, existing: boolean) {
  return {
    ticket_code: row.ticket_code,
    full_name: row.full_name,
    email: row.email,
    days: row.days,
    created_at: row.created_at,
    existing,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return fail("Method not allowed.", 405, origin);
  if (!allowedOrigins.includes("*") && (!origin || !allowedOrigins.includes(origin))) {
    return fail("Registrations are only accepted from the festival website.", 403, origin);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4000) return fail("Request too large.", 413, origin);
    body = JSON.parse(raw);
  } catch {
    return fail("Invalid request.", 400, origin);
  }

  // --- Bot checks: hidden field must be empty, form must not be filled instantly
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return fail("Could not submit the form. Please try again.", 400, origin);
  }
  const elapsed = Number(body.elapsed_ms);
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    return fail("Please take a moment to check your details, then submit again.", 400, origin);
  }

  // --- Validate fields
  const fullName = String(body.full_name ?? "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 80 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(fullName)) {
    return fail("Enter your full name using letters only.", 422, origin, "full_name");
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    return fail("Enter a valid email address, like name@example.com.", 422, origin, "email");
  }

  const phone = String(body.phone ?? "").replace(/[\s-]/g, "").replace(/^(\+91|0091|91|0)(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return fail("Enter a 10-digit Indian mobile number.", 422, origin, "phone");
  }

  const days = Array.isArray(body.days) ? [...new Set(body.days.map(String))] : [];
  if (days.length < 1 || !days.every((d) => EVENT_DAYS.includes(d))) {
    return fail("Choose at least one evening.", 422, origin, "days");
  }
  days.sort();

  if (body.consent !== true) {
    return fail("Please agree to the use of your details to issue your invite.", 422, origin, "consent");
  }

  // --- Already registered? Give the same pass back if the mobile number matches.
  const { data: existing, error: lookupError } = await supabase
    .from("registrations")
    .select("ticket_code, full_name, email, phone, days, created_at")
    .eq("email", email) // emails are always stored lowercased
    .maybeSingle();

  if (lookupError) {
    console.error("lookup", lookupError);
    return fail("Something went wrong on our side. Please try again in a few minutes.", 500, origin);
  }
  if (existing) {
    if (existing.phone === phone) return json(publicTicket(existing, true), 200, origin);
    return fail(
      "This email is already registered. Enter the mobile number you used before to download your pass again.",
      409, origin, "email",
    );
  }

  // --- Rate limit per IP
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await sha256(ip + (Deno.env.get("IP_HASH_SALT") ?? ""));
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return fail("Too many registrations from this network. Please try again in an hour.", 429, origin);
  }

  // --- Insert (retry only on the rare ticket-code collision)
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from("registrations")
      .insert({ ticket_code: ticketCode(), full_name: fullName, email, phone, days, ip_hash: ipHash })
      .select("ticket_code, full_name, email, days, created_at")
      .single();

    if (!error) return json(publicTicket(data, false), 201, origin);

    if (error.code === "23505") {
      if (error.message.includes("ticket_code")) continue;
      // Same email submitted twice at the same moment
      return fail("This email is already registered.", 409, origin, "email");
    }
    console.error("insert", error);
    return fail("Something went wrong on our side. Please try again in a few minutes.", 500, origin);
  }
  return fail("Something went wrong on our side. Please try again.", 500, origin);
});
