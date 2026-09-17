#!/usr/bin/env node
/**
 * The account emails, in NeuroLens's own words.
 *
 * Supabase's defaults are written for a developer testing a project: "Confirm
 * your email address", over a template that says nothing about what the account
 * is for. These say what the reader is confirming and why, in the voice the
 * rest of the app uses.
 *
 *   node scripts/supabase-email.mjs            # apply the templates
 *   node scripts/supabase-email.mjs --show     # print them, change nothing
 *
 * What this CANNOT change is the sender. On Supabase's built-in email service
 * every message arrives from "Supabase Auth <noreply@mail.app.supabase.io>",
 * and that name is a property of their shared sender, not of this project. It
 * takes custom SMTP to become "NeuroLens" — see `--smtp` guidance at the end.
 *
 * Email clients strip <style> blocks and most of them ignore web fonts, so
 * everything here is inline and the type falls back to the reader's system UI
 * font. No images: a logo would be blocked by default in most clients and leave
 * a broken frame where the brand was supposed to be.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.supabase.com";
const CREDENTIAL_FILES = [".supabase-credentials", ".supabase-token"];

const PAPER = "#f0e8dc";
const INK = "#161615";
const MUTED = "#5f5a52";
const RULE = "#ddd3c4";

/** One shell, so every message is recognisably from the same place. */
function wrap(heading, body, action, actionLabel, footnote) {
  return `<div style="margin:0;padding:24px;background:${PAPER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:512px;margin:0 auto;background:#fffdf9;border-radius:14px;padding:32px 28px;">
    <p style="margin:0 0 24px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">NeuroLens</p>
    <h1 style="margin:0 0 14px;font-size:23px;line-height:1.25;font-weight:600;color:${INK};">${heading}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${INK};">${body}</p>
    <a href="${action}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:8px;">${actionLabel}</a>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">${footnote}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:26px 0 0;">
    <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
      If the button does not work, copy this into your browser:<br>
      <span style="word-break:break-all;color:${INK};">${action}</span>
    </p>
    <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
      NeuroLens — adaptive reading for ADHD, dyslexia and cognitive fatigue.
    </p>
  </div>
</div>`;
}

const URL_VAR = "{{ .ConfirmationURL }}";

/**
 * Subjects say what happened and who from, because that is all a reader sees
 * in a crowded inbox. Bodies avoid "verify your identity" phrasing — nothing
 * here is an identity check, it is a reply-to-this-address check.
 */
export const EMAIL_CONFIG = {
  mailer_subjects_confirmation: "Confirm your email to start reading",
  mailer_templates_confirmation_content: wrap(
    "One click and your library is open",
    "You created a NeuroLens account with this address. Confirm it and your books, highlights and reading settings will follow you to any device you read on.",
    URL_VAR,
    "Confirm my email",
    "The link works once and expires in 24 hours. If you did not sign up, ignore this — nothing was created that you need to undo.",
  ),

  mailer_subjects_recovery: "Set a new NeuroLens password",
  mailer_templates_recovery_content: wrap(
    "Set a new password",
    "Somebody asked to reset the password for your NeuroLens account. If that was you, the button below opens a page where you can choose a new one.",
    URL_VAR,
    "Choose a new password",
    "The link works once and expires in an hour. If you did not ask for this, you can ignore it — your current password still works and nobody has been let in.",
  ),

  mailer_subjects_email_change: "Confirm your new NeuroLens address",
  mailer_templates_email_change_content: wrap(
    "Confirm your new address",
    "You asked to move your NeuroLens account to this address. Confirming it here is what completes the change.",
    URL_VAR,
    "Confirm this address",
    "Until you confirm, your account stays on the old address. If you did not ask for this, ignore it and nothing changes.",
  ),

  mailer_subjects_magic_link: "Your NeuroLens sign-in link",
  mailer_templates_magic_link_content: wrap(
    "Here is your way in",
    "Use the button below to sign in to NeuroLens. No password needed.",
    URL_VAR,
    "Sign in",
    "The link works once and expires in an hour.",
  ),

};

/**
 * The sender name, kept out of the object above on purpose.
 *
 * Supabase refuses it without custom SMTP — "Custom SMTP required to configure
 * SMTP_SENDER_NAME" — and refuses the entire request along with it. Sent in the
 * same PATCH, it would take all the templates down with it.
 */
export const SENDER_CONFIG = { smtp_sender_name: "NeuroLens" };

function credentials() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  for (const name of CREDENTIAL_FILES) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith("#")) continue;
      if (text.startsWith("SUPABASE_ACCESS_TOKEN=")) return text.split("=")[1].trim();
      if (!text.includes("=")) return text;
    }
  }
  return "";
}

/**
 * SMTP details, if somebody has supplied them.
 *
 * All five are required together — Supabase rejects a partial set, and half a
 * mail configuration is worse than none, because it silently stops sending.
 */
function smtpSettings() {
  const values = {};
  for (const name of CREDENTIAL_FILES) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith("#") || !text.includes("=")) continue;
      const key = text.slice(0, text.indexOf("=")).trim();
      const value = text.slice(text.indexOf("=") + 1).trim();
      if (/^SMTP_(HOST|PORT|USER|PASS|ADMIN_EMAIL)$/.test(key)) values[key] = value;
    }
    break;
  }
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_ADMIN_EMAIL"]) {
    const fromEnv = process.env[key]?.trim();
    if (fromEnv) values[key] = fromEnv;
    if (!values[key]) return null;
  }
  return {
    smtp_host: values.SMTP_HOST,
    smtp_port: Number(values.SMTP_PORT),
    smtp_user: values.SMTP_USER,
    smtp_pass: values.SMTP_PASS,
    smtp_admin_email: values.SMTP_ADMIN_EMAIL,
    smtp_sender_name: "NeuroLens",
  };
}

function projectRef() {
  for (const name of [".env.local", ".env"]) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    const match = readFileSync(path, "utf8").match(
      /VITE_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)/i,
    );
    if (match) return match[1];
  }
  return "";
}

async function main() {
  if (process.argv.includes("--show")) {
    for (const [key, value] of Object.entries(EMAIL_CONFIG)) {
      console.log(`\n── ${key} ──\n${value}`);
    }
    return;
  }

  const token = credentials();
  const ref = projectRef();
  if (!token) {
    console.error("\n  No Supabase access token. See scripts/supabase-apply.mjs for where it goes.\n");
    process.exit(1);
  }
  if (!ref) {
    console.error("\n  No project ref — expected VITE_SUPABASE_URL in .env.local.\n");
    process.exit(1);
  }

  // SMTP first when it is available: the templates and the sender name are both
  // refused until the project has its own mail provider, so configuring it in
  // the same run is what makes the rest of this succeed.
  const smtp = smtpSettings();
  if (smtp) {
    console.log(`\n  smtp     ${smtp.smtp_host}:${smtp.smtp_port} as ${smtp.smtp_admin_email}`);
    const sent = await fetch(`${API}/v1/projects/${ref}/config/auth`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(smtp),
    });
    if (!sent.ok) {
      console.error(`\n  SMTP was refused: HTTP ${sent.status} — ${(await sent.text()).slice(0, 300)}\n`);
      process.exit(1);
    }
    console.log("  smtp     configured.");
  }

  const response = await fetch(`${API}/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(EMAIL_CONFIG),
  });
  if (!response.ok) {
    const body = await response.text();
    // The one refusal worth explaining rather than dumping: it is not a bad
    // token or a malformed request, it is a plan restriction, and the fix is
    // the same as the fix for the sender name.
    if (/not available for free tier|custom SMTP/i.test(body)) {
      console.error(
        "\n  Supabase will not let these be changed yet:\n\n" +
          `    ${JSON.parse(body).message}\n\n` +
          "  Both the wording and the sender name need the project to send through\n" +
          "  its own mail provider. Add these to .supabase-credentials and run this\n" +
          "  again — any SMTP service works:\n\n" +
          "    SMTP_HOST=smtp.example.com\n" +
          "    SMTP_PORT=587\n" +
          "    SMTP_USER=…\n" +
          "    SMTP_PASS=…\n" +
          "    SMTP_ADMIN_EMAIL=you@example.com   # the verified From address\n\n" +
          "  Without a domain of your own, pick a provider that verifies a single\n" +
          "  address rather than a whole domain — SendGrid and Brevo both do.\n",
      );
      process.exit(1);
    }
    console.error(`\n  Could not update: HTTP ${response.status} — ${body.slice(0, 300)}\n`);
    process.exit(1);
  }

  console.log(`\n  project  ${ref}`);
  console.log("  updated  confirmation, recovery, email change, magic link");

  // Attempted on its own, so being refused cannot undo the templates.
  const sender = await fetch(`${API}/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(SENDER_CONFIG),
  });

  if (sender.ok) {
    console.log("  sender   NeuroLens\n");
    return;
  }

  console.log("  sender   unchanged — custom SMTP required\n");
  console.log(
    "  Supabase's built-in service sends every message as\n" +
      '  "Supabase Auth <noreply@mail.app.supabase.io>", and refuses to let that\n' +
      "  name be set: the sender belongs to them, not to this project. Point the\n" +
      "  project at any SMTP provider and the name becomes NeuroLens.\n",
  );
}

await main();
