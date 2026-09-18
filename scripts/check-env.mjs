#!/usr/bin/env node
/**
 * Prove the configured Supabase project is actually there.
 *
 * This exists because of a real outage. `VITE_SUPABASE_URL` in the hosting
 * provider's dashboard read `https://<ref>.superbase.co` — supe*r*base, one
 * letter wrong. Every check the app had passed: the value was present, it was a
 * valid https URL, it had the right project ref, and the Content-Security-Policy
 * generated from it matched the client built from it perfectly. Both were
 * pointing at a domain that does not exist.
 *
 * So sign-in got as far as Google, came back with its authorisation code, and
 * the exchange went to a host with no DNS record. The reader saw a home page
 * and no session. Nothing logged, nothing warned, and no dashboard setting
 * could have fixed it. It was live for days.
 *
 * The lesson is that no amount of *shape* checking catches this — the string
 * was perfectly well formed. The only thing that distinguishes a typo from a
 * correct value is whether something answers. So this asks.
 *
 * Non-fatal by default: a deploy that fails because a third party had a bad
 * thirty seconds is its own kind of outage. It prints a banner impossible to
 * miss in a build log instead. `NEUROLENS_STRICT_ENV=1` makes it fatal, which
 * is what CI uses.
 */
import { readFile } from "node:fs/promises";

const strict = process.env.NEUROLENS_STRICT_ENV === "1";
const TIMEOUT_MS = 10_000;

/** `.env.local` is not in `process.env`; read it the way Vite would. */
async function fromEnvFile() {
  const out = {};
  for (const file of [".env.local", ".env"]) {
    try {
      const text = await readFile(file, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        const [, key, raw] = match;
        if (out[key] === undefined) out[key] = raw.trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* not there; that is normal */
    }
  }
  return out;
}

const problems = [];
const notes = [];

function problem(what, fix) {
  problems.push({ what, fix });
}

const file = await fromEnvFile();
const read = (name) => process.env[name]?.trim() || file[name] || "";

const url = read("VITE_SUPABASE_URL");
const key = read("VITE_SUPABASE_ANON_KEY");

if (!url) {
  problem("VITE_SUPABASE_URL is not set.", "Set it to https://<project-ref>.supabase.co");
} else if (!/^https:\/\//.test(url)) {
  problem(`VITE_SUPABASE_URL is not https: ${url}`, "Supabase is https only.");
} else {
  // Near-misses, named explicitly. A human reading `superbase` in a dashboard
  // field does not see it; a string comparison does.
  const host = new URL(url).hostname;
  const typo = /\b(superbase|supabse|supbase|supabase)\b/.exec(host)?.[1];
  if (typo && typo !== "supabase") {
    problem(
      `VITE_SUPABASE_URL host is misspelled: ${host}`,
      `Almost certainly meant "${host.replace(typo, "supabase")}".`,
    );
  } else if (!/\.supabase\.(co|in)$/.test(host)) {
    // Not an error — a self-hosted project is a real thing — but worth saying.
    notes.push(`Host is not *.supabase.co: ${host}. Fine if self-hosted or a custom domain.`);
  }
}

if (!key) {
  problem("VITE_SUPABASE_ANON_KEY is not set.", "Copy it from the project's API settings.");
} else if (key.length < 100) {
  problem(
    `VITE_SUPABASE_ANON_KEY looks truncated (${key.length} characters).`,
    "An anon key is a JWT, a couple of hundred characters long.",
  );
}

/**
 * The check that matters: does the project answer, and does it accept the key?
 *
 * `/auth/v1/settings` is the right endpoint for it — public, cheap, needs the
 * anon key, and its body says which sign-in providers are actually turned on,
 * which is the second thing that silently breaks sign-in.
 */
if (url && key && problems.length === 0) {
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      problem(
        `${url} answered ${response.status} for /auth/v1/settings.`,
        response.status === 401
          ? "The anon key does not belong to this project."
          : "Check the project is not paused.",
      );
    } else {
      const settings = await response.json();
      const providers = Object.entries(settings.external ?? {})
        .filter(([, on]) => on === true)
        .map(([name]) => name);
      notes.push(
        `Reached ${new URL(url).hostname}; sign-in enabled for: ${providers.join(", ") || "nothing"}.`,
      );
      if (!providers.includes("google")) {
        notes.push("Google is NOT enabled on this project — Google sign-in will fail.");
      }
    }
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "timed out" : (error?.message ?? "failed");
    problem(
      `Could not reach ${url} — ${reason}.`,
      "A host that does not resolve is a typo, not an outage. Check the spelling of VITE_SUPABASE_URL.",
    );
  }
}

const line = "─".repeat(72);
if (problems.length > 0) {
  console.error(`\n${line}`);
  console.error(
    strict
      ? "  ENVIRONMENT CHECK FAILED"
      : "  ENVIRONMENT CHECK FAILED  (warning — build continues)",
  );
  console.error(line);
  for (const { what, fix } of problems) {
    console.error(`\n  ✗ ${what}\n    → ${fix}`);
  }
  console.error(`\n  Supabase sign-in and sync will not work until this is fixed.`);
  console.error(`${line}\n`);
  process.exit(strict ? 1 : 0);
}

for (const note of notes) console.log(`[check-env] ${note}`);
console.log("[check-env] Supabase reachable and the anon key is accepted.");
