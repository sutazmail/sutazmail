/**
 * Input validation + shell-safe quoting for the mailserver command layer.
 *
 * The docker-mailserver REST bridge runs `subprocess.run(cmd, shell=True)` as ROOT, so
 * every value that reaches a command MUST pass through here first. Never interpolate raw
 * client strings into a command — validate the shape, then `shellQuote` free-form values.
 */

/** Standard email shape (used for both mailbox addresses and alias recipients). */
export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** A bare domain (no user part). */
export const DOMAIN_RE = /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Rejects ASCII control characters (0x00–0x1F and 0x7F). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

export function assertEmail(x: string): string {
  if (!EMAIL_RE.test(x)) {
    throw new Error(`Invalid email address: ${x}`);
  }
  return x;
}

export function assertDomain(x: string): string {
  if (!DOMAIN_RE.test(x)) {
    throw new Error(`Invalid domain: ${x}`);
  }
  return x;
}

/**
 * An alias source is either a normal email address OR a docker-mailserver regex alias of
 * the form `/pattern/`. Regex aliases are passed to the server verbatim (they are matched
 * server-side); we only accept the `/.../` envelope and reject control characters.
 */
export function assertAliasSource(x: string): string {
  if (EMAIL_RE.test(x)) return x;
  // Catch-all alias for a whole domain, e.g. "@example.com".
  if (/^@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(x)) return x;
  // docker-mailserver regex alias of the form /pattern/ (matched server-side, verbatim).
  if (/^\/.+\/$/.test(x) && !CONTROL_CHAR_RE.test(x)) return x;
  throw new Error(`Invalid alias source: ${x}`);
}

/**
 * Wrap a string in single quotes for safe shell interpolation, escaping embedded single
 * quotes as `'\''`. Rejects control characters outright (they have no place in a password
 * or command argument and complicate quoting).
 */
export function shellQuote(s: string): string {
  if (CONTROL_CHAR_RE.test(s)) {
    throw new Error("Value contains control characters");
  }
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function assertPassword(x: string): string {
  if (x.length < 8 || x.length > 128) {
    throw new Error("Password must be 8–128 characters");
  }
  if (CONTROL_CHAR_RE.test(x)) {
    throw new Error("Password contains control characters");
  }
  return x;
}

/** Generate a strong 20-character password using crypto randomness (for a "generate" button). */
export function genPassword(): string {
  // Exclude ambiguous/shell-hostile characters; the set below is URL/shell-safe.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^*-_=+";
  const len = 20;
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
