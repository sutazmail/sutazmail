/**
 * docker-mailserver REST client + whitelisted `setup` command builders + stdout parsers.
 *
 * SECURITY: the REST server runs `subprocess.run(cmd, shell=True)` as ROOT. This module is
 * the trust boundary. Every command is built from a FIXED template with a whitelisted verb;
 * no raw client string is ever interpolated. Free-form values (passwords) are shell-quoted
 * and all inputs are validated via ./validate BEFORE the command is built.
 *
 * server-only: reads DMS_API_KEY + MAILSERVER_API_URL from runtime env; the key is NEVER
 * exposed to the client. Only imported by server components / server actions.
 */
import {
  assertAliasSource,
  assertDomain,
  assertEmail,
  assertPassword,
  shellQuote,
} from "./validate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Account {
  mailbox: string;
  user: string;
  domain: string;
  /** Used storage, e.g. "12M", or null when no quota data. */
  used: string | null;
  /** Total quota, e.g. "1G" / "unlimited", or null when no quota set. */
  total: string | null;
  /** Percent used (0–100), or null when no quota. */
  percent: number | null;
}

export interface Alias {
  source: string;
  recipient: string;
}

export interface Domain {
  domain: string;
  mailboxes: number;
  /** DKIM public DNS record (TXT value), or null if none found. */
  dkim: string | null;
}

export interface ServerStatus {
  reachable: boolean;
  error?: string;
}

interface RestResponse {
  status: string;
  returncode: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// REST transport
// ---------------------------------------------------------------------------

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/**
 * POST a single `setup` command to the mailserver REST bridge. Retries once on a network
 * error ("fetch failed"), since the python server is occasionally flaky.
 */
async function runCommand(command: string, timeout = 8): Promise<RestResponse> {
  const url = env("MAILSERVER_API_URL");
  const key = env("DMS_API_KEY");

  const doFetch = () =>
    fetch(`${url}/`, {
      method: "POST",
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command, timeout }),
      signal: AbortSignal.timeout((timeout + 2) * 1000),
      cache: "no-store",
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch (err) {
    if (err instanceof Error && err.message.includes("fetch failed")) {
      res = await doFetch(); // retry once
    } else {
      throw err;
    }
  }

  if (!res.ok) {
    throw new Error(`Mail server returned HTTP ${res.status}`);
  }
  return (await res.json()) as RestResponse;
}

/** Run a command and throw a cleaned error if returncode != 0. */
async function runOrThrow(command: string, timeout = 8): Promise<string> {
  const r = await runCommand(command, timeout);
  if (r.returncode !== 0) {
    throw new Error(cleanStderr(r.stderr) || `Command failed (code ${r.returncode})`);
  }
  return r.stdout;
}

function cleanStderr(stderr: string): string {
  return stderr.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Parsers (exported for unit testing without network)
// ---------------------------------------------------------------------------

/**
 * Parse the output of `setup email list`. Each account line looks like:
 *   * user@domain ( 12M / 1G ) [45%]
 *   * user@domain ( 12M / ~ ) [0%]      (unlimited quota)
 *   * user@domain                        (no quota)
 * We first strip characters outside a safe set, then match the quota form; falling back to
 * the bare-address form.
 */
export function parseAccounts(stdout: string): Account[] {
  const accounts: Account[] = [];
  for (const rawLine of stdout.split("\n")) {
    if (!rawLine.includes("*")) continue;
    const line = rawLine.replace(/[^\w.~\-_@\s*%]/g, " ");

    const quota = line.match(/\*\s+(\S+)@(\S+)\s+([\w.~]+)\s+([\w.~]+)\s+(\d+)%/);
    if (quota) {
      const [, user, domain, used, totalRaw, pct] = quota;
      accounts.push({
        mailbox: `${user}@${domain}`,
        user,
        domain,
        used,
        total: totalRaw === "~" ? "unlimited" : totalRaw,
        percent: Number(pct),
      });
      continue;
    }

    const bare = line.match(/\*\s+(\S+)@(\S+)/);
    if (bare) {
      const [, user, domain] = bare;
      accounts.push({
        mailbox: `${user}@${domain}`,
        user,
        domain,
        used: null,
        total: null,
        percent: null,
      });
    }
  }
  return accounts;
}

/**
 * Parse the output of `setup alias list`. Each line looks like:
 *   * source@domain dest@domain
 *   * /regex/ dest@domain           (regex alias source)
 */
export function parseAliases(stdout: string): Alias[] {
  const aliases: Alias[] = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("*")) continue;
    // `setup alias list` prints `* <source> <recipient1>,<recipient2>,...` — the recipients
    // are comma-separated in a single whitespace-delimited token. Emit one entry per recipient
    // so each row maps to a single `alias del <source> <recipient>` operation.
    const m = line.match(/^\*\s+(\S+)\s+(\S+)/);
    if (!m) continue;
    const source = m[1];
    for (const part of m[2].split(",")) {
      const recipient = part.trim();
      if (recipient) aliases.push({ source, recipient });
    }
  }
  return aliases;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function listAccounts(): Promise<Account[]> {
  const stdout = await runOrThrow("setup email list");
  return parseAccounts(stdout);
}

export async function addAccount(email: string, password: string): Promise<void> {
  assertEmail(email);
  assertPassword(password);
  await runOrThrow(`setup email add ${email} ${shellQuote(password)}`);
}

export async function updateAccountPassword(email: string, password: string): Promise<void> {
  assertEmail(email);
  assertPassword(password);
  await runOrThrow(`setup email update ${email} ${shellQuote(password)}`);
}

export async function deleteAccount(email: string): Promise<void> {
  assertEmail(email);
  await runOrThrow(`setup email del -y ${email}`);
}

// ---------------------------------------------------------------------------
// Aliases
// ---------------------------------------------------------------------------

export async function listAliases(): Promise<Alias[]> {
  const stdout = await runOrThrow("setup alias list");
  return parseAliases(stdout);
}

export async function addAlias(source: string, recipient: string): Promise<void> {
  assertAliasSource(source);
  assertEmail(recipient);
  // source may be a /regex/ containing shell metacharacters — quote both operands.
  await runOrThrow(`setup alias add ${shellQuote(source)} ${shellQuote(recipient)}`);
}

export async function deleteAlias(source: string, recipient: string): Promise<void> {
  assertAliasSource(source);
  assertEmail(recipient);
  await runOrThrow(`setup alias del ${shellQuote(source)} ${shellQuote(recipient)}`);
}

// ---------------------------------------------------------------------------
// Quota (doveadm) — used by the self-service portal + admin console
// ---------------------------------------------------------------------------

export interface Quota {
  /** Used storage in kilobytes (doveadm reports KB). */
  storageUsedKb: number;
  /** Storage limit in KB, or null when unlimited ("-"). */
  storageLimitKb: number | null;
  /** Message count. */
  messages: number;
  /** Message limit, or null when unlimited. */
  messageLimit: number | null;
  /** Storage percent used (0–100), or null when unlimited. */
  percent: number | null;
}

/**
 * Parse `doveadm quota get -u <user>` output (verified live 2026-07-03):
 *   Quota name Type    Value Limit                         %
 *   User quota STORAGE     1     -                         0
 *   User quota MESSAGE     1     -                         0
 */
export function parseQuota(stdout: string): Quota | null {
  let storage: RegExpMatchArray | null = null;
  let message: RegExpMatchArray | null = null;
  for (const line of stdout.split("\n")) {
    const m = line.match(/\b(STORAGE|MESSAGE)\s+(\d+)\s+(\d+|-)\s+(\d+|-)/);
    if (!m) continue;
    if (m[1] === "STORAGE") storage = m;
    else message = m;
  }
  if (!storage && !message) return null;
  const lim = (s: string | undefined) => (s === undefined || s === "-" ? null : Number(s));
  return {
    storageUsedKb: storage ? Number(storage[2]) : 0,
    storageLimitKb: storage ? lim(storage[3]) : null,
    messages: message ? Number(message[2]) : 0,
    messageLimit: message ? lim(message[3]) : null,
    percent: storage && storage[4] !== "-" ? Number(storage[4]) : null,
  };
}

export async function getQuota(email: string): Promise<Quota | null> {
  assertEmail(email);
  const r = await runCommand(`doveadm quota get -u ${email}`);
  if (r.returncode !== 0) return null;
  return parseQuota(r.stdout);
}

/** Set a mailbox quota, e.g. "10G" / "512M". Admin console operation. */
export async function setQuota(email: string, quota: string): Promise<void> {
  assertEmail(email);
  if (!/^\d+(?:[KMGT])?$/i.test(quota)) {
    throw new Error("Quota must look like 500M or 10G");
  }
  await runOrThrow(`setup quota set ${email} ${quota}`);
}

export async function deleteQuota(email: string): Promise<void> {
  assertEmail(email);
  await runOrThrow(`setup quota del ${email}`);
}

// ---------------------------------------------------------------------------
// Active Sieve access (plain ~/.dovecot.sieve) — needed because DMS installs
// forwards as a plain file, invisible to ManageSieve. We read/back-up it via the
// REST bridge so taking over a mailbox never silently destroys an existing rule.
// ---------------------------------------------------------------------------

/** Resolve a mailbox's home dir from Dovecot (no path assumptions). Null if unknown. */
export async function getMailboxHome(email: string): Promise<string | null> {
  assertEmail(email);
  const r = await runCommand(`doveadm user -f home ${shellQuote(email)}`);
  if (r.returncode !== 0) return null;
  const home = r.stdout.trim();
  return home.startsWith("/") ? home : null;
}

/** Read the raw active Sieve script (follows the symlink if any). Null if none. */
export async function readActiveSieve(email: string): Promise<string | null> {
  const home = await getMailboxHome(email);
  if (!home) return null;
  const r = await runCommand(`cat ${shellQuote(`${home}/.dovecot.sieve`)}`);
  if (r.returncode !== 0) return null;
  return r.stdout.length > 0 ? r.stdout : null;
}

/**
 * Back up a pre-existing PLAIN active Sieve (not our managed symlink) once, before
 * we take the mailbox over. cp -n never overwrites an existing backup. Best-effort;
 * only acts when .dovecot.sieve is a regular file (a symlink means we already own it).
 */
export async function backupActiveSieve(email: string): Promise<void> {
  const home = await getMailboxHome(email);
  if (!home) return;
  const p = shellQuote(`${home}/.dovecot.sieve`);
  const b = shellQuote(`${home}/.dovecot.sieve.pre-sutazmail`);
  await runCommand(`test -f ${p} && test ! -L ${p} && cp -n ${p} ${b} || true`).catch(
    () => undefined,
  );
}

// ---------------------------------------------------------------------------
// Server status
// ---------------------------------------------------------------------------

export async function serverStatus(): Promise<ServerStatus> {
  try {
    const r = await runCommand("setup help");
    if (r.returncode !== 0) {
      return { reachable: false, error: cleanStderr(r.stderr) || `code ${r.returncode}` };
    }
    return { reachable: true };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}

// ---------------------------------------------------------------------------
// Domains + DKIM
// ---------------------------------------------------------------------------

/** Generate a DKIM key + rspamd config for a domain (works even before it has mailboxes). */
export async function generateDkim(domain: string): Promise<void> {
  assertDomain(domain);
  // Key generation can take a few seconds; give it headroom.
  await runOrThrow(`setup config dkim keysize 2048 domain ${shellQuote(domain)}`, 60);
}

/**
 * Remove a domain's DKIM key files. Best-effort (rm -f never errors if absent).
 * SAFE: these files are per-domain-named, and domains SutazMail adds are never wired
 * into the shared rspamd dkim_signing.conf (verified: `setup config dkim` creates keys
 * but does not touch override.d), so removing them cannot affect any other domain's
 * signing. `domain` passed assertDomain ([A-Za-z0-9.-] only) — no shell metacharacters.
 */
export async function removeDkim(domain: string): Promise<void> {
  assertDomain(domain);
  const dir = "/tmp/docker-mailserver/rspamd/dkim";
  await runCommand(
    `rm -f ${dir}/rsa-*-mail-${domain}.private.txt ${dir}/rsa-*-mail-${domain}.public.txt ${dir}/rsa-*-mail-${domain}.public.dns.txt`,
  ).catch(() => undefined);
}

/** Best-effort read of a domain's DKIM public DNS record. Returns null if unavailable. */
export async function readDkim(domain: string): Promise<string | null> {
  assertDomain(domain);
  const path = `/tmp/docker-mailserver/rspamd/dkim/rsa-2048-mail-${domain}.public.dns.txt`;
  const r = await runCommand(`cat ${path}`);
  if (r.returncode !== 0) return null;
  const text = r.stdout.trim();
  return text.length > 0 ? text : null;
}

/**
 * Derive distinct domains from accounts + aliases, count mailboxes per domain, and attach a
 * best-effort DKIM record for each.
 */
export async function listDomains(): Promise<Domain[]> {
  const [accounts, aliases] = await Promise.all([listAccounts(), listAliases()]);

  const mailboxCount = new Map<string, number>();
  for (const a of accounts) {
    mailboxCount.set(a.domain, (mailboxCount.get(a.domain) ?? 0) + 1);
  }

  const domains = new Set<string>(accounts.map((a) => a.domain));
  for (const alias of aliases) {
    const at = alias.source.lastIndexOf("@");
    if (at > 0) {
      const dom = alias.source.slice(at + 1);
      if (DOMAIN_OK(dom)) domains.add(dom);
    }
  }

  const sorted = [...domains].sort();
  return Promise.all(
    sorted.map(async (domain) => ({
      domain,
      mailboxes: mailboxCount.get(domain) ?? 0,
      dkim: await readDkim(domain).catch(() => null),
    })),
  );
}

function DOMAIN_OK(x: string): boolean {
  return /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(x);
}
