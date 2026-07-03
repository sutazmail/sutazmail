/**
 * Self-service mailbox rules (autoresponder + forwarding) expressed as a single
 * managed Sieve script we own, named "sutazmail", written/activated on the user's
 * behalf via the Dovecot master account (see ./sieve openMasterSieve).
 *
 * The script is the source of truth on the mail server, but parsing arbitrary Sieve
 * is fragile — so we embed the structured settings as a JSON marker comment on the
 * first line and regenerate the Sieve body from it. getRules reads the marker;
 * setRules rewrites the whole managed script from validated settings.
 */
import { openMasterSieve, type ManageSieveClient } from "./sieve";
import { assertEmail } from "./validate";
import { readActiveSieve, backupActiveSieve } from "./mailserver";

const SCRIPT_NAME = "sutazmail";
const MARKER = "# SUTAZMAIL-CONFIG:";

export interface Forwarding {
  enabled: boolean;
  to: string; // destination address (when enabled)
  keepCopy: boolean; // also keep a copy in this mailbox
}

export interface Autoresponder {
  enabled: boolean;
  days: number; // re-send interval per sender, 1..365
  subject: string;
  message: string;
}

export interface MailboxRules {
  forwarding: Forwarding;
  autoresponder: Autoresponder;
}

export const EMPTY_RULES: MailboxRules = {
  forwarding: { enabled: false, to: "", keepCopy: true },
  autoresponder: { enabled: false, days: 7, subject: "", message: "" },
};

/** Escape a JS string for a Sieve quoted-string (RFC 5228 §2.4.2). */
function sieveQuote(s: string): string {
  return `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** True if the text has control chars other than tab (9) and newline (10). */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10) return true;
  }
  return false;
}

export function validateRules(input: MailboxRules): MailboxRules {
  const f = input.forwarding;
  const a = input.autoresponder;

  const forwarding: Forwarding = {
    enabled: Boolean(f.enabled),
    to: "",
    keepCopy: Boolean(f.keepCopy),
  };
  if (forwarding.enabled) {
    forwarding.to = assertEmail(f.to.trim().toLowerCase());
  }

  const days = Math.trunc(Number(a.days));
  if (a.enabled && (!Number.isFinite(days) || days < 1 || days > 365)) {
    throw new Error("Autoresponder interval must be between 1 and 365 days");
  }
  const subject = a.subject.trim();
  const message = a.message.replace(/\r\n/g, "\n");
  if (a.enabled && message.trim().length === 0) {
    throw new Error("Autoresponder needs a message");
  }
  if (subject.length > 200) throw new Error("Subject is too long (max 200)");
  if (message.length > 4000) throw new Error("Message is too long (max 4000)");
  // Control chars (except newline/tab) would corrupt the Sieve script.
  if (hasControlChars(subject + message)) {
    throw new Error("Subject/message contains invalid characters");
  }

  return {
    forwarding,
    autoresponder: {
      enabled: Boolean(a.enabled),
      days: a.enabled ? days : 7,
      subject,
      message,
    },
  };
}

/** Render the managed Sieve script from validated settings. */
export function renderScript(rules: MailboxRules): string {
  const requires: string[] = [];
  if (rules.forwarding.enabled && rules.forwarding.keepCopy) requires.push("copy");
  if (rules.autoresponder.enabled) requires.push("vacation");

  const lines: string[] = [];
  lines.push(`${MARKER} ${JSON.stringify(rules)}`);
  lines.push("# Managed by SutazMail — edits here are overwritten.");
  if (requires.length) lines.push(`require [${requires.map(sieveQuote).join(", ")}];`);

  if (rules.forwarding.enabled) {
    lines.push(
      rules.forwarding.keepCopy
        ? `redirect :copy ${sieveQuote(rules.forwarding.to)};`
        : `redirect ${sieveQuote(rules.forwarding.to)};`,
    );
  }
  if (rules.autoresponder.enabled) {
    const parts = [`vacation :days ${rules.autoresponder.days}`];
    if (rules.autoresponder.subject) parts.push(`:subject ${sieveQuote(rules.autoresponder.subject)}`);
    parts.push(sieveQuote(rules.autoresponder.message));
    lines.push(`${parts.join(" ")};`);
  }
  return lines.join("\n") + "\n";
}

/** Parse the JSON marker back out of a managed script; null if not ours/absent. */
export function parseScript(script: string | null): MailboxRules | null {
  if (!script) return null;
  const line = script.split("\n").find((l) => l.startsWith(MARKER));
  if (!line) return null;
  try {
    const raw = JSON.parse(line.slice(MARKER.length).trim()) as MailboxRules;
    return validateRules(raw);
  } catch {
    return null;
  }
}

function unescapeSieve(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/**
 * Best-effort import of an EXISTING plain Sieve script (e.g. a DMS-installed forward)
 * into our model, so taking a mailbox over preserves it. Recognizes redirect (forward)
 * and vacation; anything else is left to the pre-takeover backup for recovery.
 */
/**
 * Split a Sieve script into TOP-LEVEL (brace-depth 0) statements, respecting quoted
 * strings and `#` comments — so a `;` inside a string doesn't split a statement, and
 * a `redirect`/`vacation` nested inside an `if { … }` block is NOT seen as top-level.
 */
function topLevelStatements(script: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < script.length; i++) {
    const ch = script[i];
    if (ch === "#") {
      const nl = script.indexOf("\n", i);
      i = nl === -1 ? script.length : nl;
      continue;
    }
    if (ch === '"') {
      cur += ch;
      i++;
      for (; i < script.length; i++) {
        cur += script[i];
        if (script[i] === "\\" && i + 1 < script.length) {
          cur += script[i + 1];
          i++;
        } else if (script[i] === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === "{") {
      depth++;
      cur += ch;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
      cur += ch;
      // A block command (if/…{ }) ends at its closing brace, not a ';'. When the
      // brace returns us to top level, end the statement so a following action
      // (e.g. a real top-level redirect) is parsed on its own.
      if (depth === 0) {
        if (cur.trim()) out.push(cur.trim());
        cur = "";
      }
    } else if (ch === ";" && depth === 0) {
      cur += ch;
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function importFromRaw(script: string): MailboxRules {
  const rules: MailboxRules = {
    forwarding: { ...EMPTY_RULES.forwarding },
    autoresponder: { ...EMPTY_RULES.autoresponder },
  };
  const statements = topLevelStatements(script);

  // Only an UNCONDITIONAL, top-level redirect is a forward. One nested in an if{}
  // block stays inside that block's statement (which starts with `if`) and is
  // intentionally not imported — importing it as unconditional would misroute mail.
  const redirStmt = statements.find((s) => /^redirect\b/.test(s));
  if (redirStmt) {
    const m = redirStmt.match(/^redirect\s+(:copy\s+)?"((?:[^"\\]|\\.)*)"/);
    if (m) {
      rules.forwarding = { enabled: true, to: unescapeSieve(m[2]), keepCopy: Boolean(m[1]) };
    }
  }

  const vacStmt = statements.find((s) => /^vacation\b/.test(s));
  if (vacStmt) {
    const days = vacStmt.match(/:days\s+(\d+)/);
    const subject = vacStmt.match(/:subject\s+"((?:[^"\\]|\\.)*)"/);
    // Positional reason is the LAST string; tagged args (:subject/:from/:handle) precede it.
    const strings = [...vacStmt.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => unescapeSieve(m[1]));
    rules.autoresponder = {
      enabled: true,
      days: days ? Number(days[1]) : 7,
      subject: subject ? unescapeSieve(subject[1]) : "",
      message: strings.length ? strings[strings.length - 1] : "",
    };
  }

  // Don't throw on import; validation happens when the user saves.
  try {
    return validateRules(rules);
  } catch {
    return rules;
  }
}

/**
 * Read the current self-service rules. If we already manage this mailbox, parse our
 * marker. Otherwise import any pre-existing plain Sieve so the UI shows it (and a
 * subsequent save preserves it). Defaults if nothing is set.
 */
export async function getRules(mailbox: string): Promise<MailboxRules> {
  const c: ManageSieveClient = await openMasterSieve(mailbox);
  let managed: string | null;
  try {
    managed = await c.getScript(SCRIPT_NAME);
  } finally {
    await c.logout();
  }
  const parsed = parseScript(managed);
  if (parsed) return parsed;

  const raw = await readActiveSieve(mailbox).catch(() => null);
  return raw ? importFromRaw(raw) : EMPTY_RULES;
}

/**
 * Persist rules: write + activate our managed script. On the FIRST takeover of a
 * mailbox (no managed script yet) we back up any pre-existing plain active Sieve so
 * an existing forward/filter is never silently destroyed.
 */
export async function setRules(mailbox: string, input: MailboxRules): Promise<MailboxRules> {
  const rules = validateRules(input);
  const script = renderScript(rules);
  const c = await openMasterSieve(mailbox);
  try {
    const existing = await c.getScript(SCRIPT_NAME);
    if (existing === null) {
      await backupActiveSieve(mailbox).catch(() => undefined);
    }
    const put = await c.putScript(SCRIPT_NAME, script);
    if (put.status !== "OK") throw new Error(`Could not save rules: ${put.statusLine}`);
    const act = await c.setActive(SCRIPT_NAME);
    if (act.status !== "OK") throw new Error(`Could not activate rules: ${act.statusLine}`);
    return rules;
  } finally {
    await c.logout();
  }
}
