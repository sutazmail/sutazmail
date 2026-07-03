/**
 * Minimal ManageSieve (RFC 5804) client over the docker network (`mailserver:4190`).
 *
 * Two jobs:
 *  1. End-user credential verification (SASL PLAIN against Dovecot — the same passdb
 *     as IMAP). The password travels only over this socket; it NEVER goes through the
 *     DMS REST bridge (which executes shell as root) and is never logged.
 *  2. Sieve script management (vacation auto-responder, forwarding rules) — as the
 *     end user, or on their behalf via the Dovecot master account (SASL PLAIN with
 *     authzid = target mailbox, authcid = master user).
 *
 * Protocol notes (verified against RFC 5804 + Dovecot Pigeonhole):
 *  - Server greets with capability lines ending in an OK line.
 *  - If STARTTLS is advertised we upgrade before authenticating (Dovecot disallows
 *    plaintext auth otherwise); after TLS the server re-sends the greeting.
 *  - Responses may contain literals `{N}` CRLF <N bytes>; a response unit ends with
 *    an OK/NO/BYE line outside any literal.
 *  - Client strings are sent quoted (escaped) or as non-synchronizing literals `{N+}`.
 */
import { connect as tcpConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

const HOST = () => process.env.MAILSERVER_SIEVE_HOST || "mailserver";
const PORT = () => Number(process.env.MAILSERVER_SIEVE_PORT || 4190);
// The mailserver's cert is issued for its mail hostname, not the docker alias.
const TLS_SERVERNAME = () => process.env.MAILSERVER_TLS_SERVERNAME || "mail.tottynotti.com";
// Internal docker network; cert may be self-signed during renewal windows.
const TLS_REJECT_UNAUTHORIZED = () => process.env.MAILSERVER_TLS_REJECT_UNAUTHORIZED === "1";
const OP_TIMEOUT_MS = 10_000;

export type SieveStatus = "OK" | "NO" | "BYE";

export interface SieveResponse {
  status: SieveStatus;
  /** Non-terminal lines of the response unit (capabilities, script names, …). */
  lines: string[];
  /** Literal payloads, in order of appearance. */
  literals: Buffer[];
  /** The terminal OK/NO/BYE line. */
  statusLine: string;
}

/** Connectivity/protocol failure — distinct from an authentication rejection. */
export class SieveConnectionError extends Error {}

function quote(s: string): string {
  return `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

class ManageSieveClient {
  private socket!: Socket;
  private buf: Buffer = Buffer.alloc(0);
  private pending: { resolve: (r: SieveResponse) => void; reject: (e: Error) => void } | null = null;
  private partial: { lines: string[]; literals: Buffer[] } = { lines: [], literals: [] };
  private literalRemaining = 0;
  private literalChunks: Buffer[] = [];
  private closed = false;

  async connect(): Promise<SieveResponse> {
    this.socket = tcpConnect({ host: HOST(), port: PORT() });
    this.wire(this.socket);
    // Any failure before the caller reaches its try/finally would otherwise leak
    // the socket FD (the server greeting/STARTTLS/TLS error paths). Self-clean here.
    try {
      const greeting = await this.awaitResponse("connect");
      if (greeting.status !== "OK") throw new SieveConnectionError(`greeting: ${greeting.statusLine}`);
      if (greeting.lines.some((l) => l.toUpperCase().startsWith('"STARTTLS"'))) {
        const ok = await this.command("STARTTLS");
        if (ok.status !== "OK") throw new SieveConnectionError(`STARTTLS refused: ${ok.statusLine}`);
        await this.upgradeTls();
        // Per RFC 5804 the server re-issues the capability greeting after TLS.
        const greeting2 = await this.awaitResponse("post-TLS greeting");
        if (greeting2.status !== "OK") throw new SieveConnectionError(`post-TLS greeting: ${greeting2.statusLine}`);
        return greeting2;
      }
      return greeting;
    } catch (err) {
      this.destroy();
      throw err;
    }
  }

  /** Release the socket exactly once; suppresses the "close" handler's re-reject. */
  private destroy() {
    this.closed = true;
    try {
      this.socket.destroy();
    } catch {
      /* already gone */
    }
  }

  private wire(s: Socket) {
    s.setTimeout(OP_TIMEOUT_MS);
    s.on("data", (chunk: Buffer) => this.onData(chunk));
    s.on("error", (err) => {
      this.fail(new SieveConnectionError(`socket error: ${err.message}`));
      this.destroy();
    });
    s.on("timeout", () => {
      // Node does NOT close the socket on 'timeout' — do it ourselves or the FD leaks.
      this.fail(new SieveConnectionError("socket timeout"));
      this.destroy();
    });
    s.on("close", () => {
      if (!this.closed) this.fail(new SieveConnectionError("connection closed unexpectedly"));
    });
  }

  private async upgradeTls(): Promise<void> {
    const plain = this.socket;
    plain.removeAllListeners("data");
    plain.removeAllListeners("error");
    plain.removeAllListeners("timeout");
    plain.removeAllListeners("close");
    await new Promise<void>((resolve, reject) => {
      const tls = tlsConnect(
        {
          socket: plain,
          servername: TLS_SERVERNAME(),
          rejectUnauthorized: TLS_REJECT_UNAUTHORIZED(),
        },
        () => resolve(),
      );
      tls.once("error", (e) => reject(new SieveConnectionError(`TLS: ${e.message}`)));
      this.socket = tls;
      this.wire(tls);
    });
  }

  private fail(err: Error) {
    const p = this.pending;
    this.pending = null;
    if (p) p.reject(err);
  }

  private onData(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk]);
    this.drain();
  }

  private drain() {
    for (;;) {
      if (this.literalRemaining > 0) {
        if (this.buf.length === 0) return;
        const take = Math.min(this.literalRemaining, this.buf.length);
        this.literalChunks.push(this.buf.subarray(0, take));
        this.buf = this.buf.subarray(take);
        this.literalRemaining -= take;
        if (this.literalRemaining > 0) return;
        this.partial.literals.push(Buffer.concat(this.literalChunks));
        this.literalChunks = [];
        continue;
      }
      const nl = this.buf.indexOf("\r\n");
      if (nl === -1) return;
      const line = this.buf.subarray(0, nl).toString("utf8");
      this.buf = this.buf.subarray(nl + 2);
      const lit = /\{(\d+)\+?\}\s*$/.exec(line);
      if (lit) {
        this.partial.lines.push(line);
        this.literalRemaining = Number(lit[1]);
        if (this.literalRemaining === 0) this.partial.literals.push(Buffer.alloc(0));
        continue;
      }
      const m = /^(OK|NO|BYE)\b/i.exec(line);
      if (m) {
        const done: SieveResponse = {
          status: m[1].toUpperCase() as SieveStatus,
          lines: this.partial.lines,
          literals: this.partial.literals,
          statusLine: line,
        };
        this.partial = { lines: [], literals: [] };
        const p = this.pending;
        this.pending = null;
        if (p) p.resolve(done);
        return; // one response unit per command — stop until next await
      }
      this.partial.lines.push(line);
    }
  }

  private awaitResponse(what: string): Promise<SieveResponse> {
    if (this.pending) return Promise.reject(new SieveConnectionError(`overlapping ${what}`));
    return new Promise<SieveResponse>((resolve, reject) => {
      this.pending = { resolve, reject };
      // Data may already be buffered (e.g. greeting raced the listener).
      this.drain();
    });
  }

  /** Send one command line (raw bytes already protocol-encoded) and await its response. */
  async command(raw: string | Buffer): Promise<SieveResponse> {
    const p = this.awaitResponse(typeof raw === "string" ? raw.split(" ")[0] : "literal-cmd");
    this.socket.write(typeof raw === "string" ? `${raw}\r\n` : raw);
    return p;
  }

  /**
   * SASL PLAIN (RFC 4616): base64("authzid NUL authcid NUL password").
   * `authzid` = mailbox to act as (empty = authcid itself);
   * `authcid` = authenticating identity (end user, or the master user).
   */
  async authenticatePlain(authcid: string, password: string, authzid = ""): Promise<SieveResponse> {
    const b64 = Buffer.from([authzid, authcid, password].join(String.fromCharCode(0)), "utf8").toString("base64");
    return this.command(`AUTHENTICATE "PLAIN" ${quote(b64)}`);
  }

  async listScripts(): Promise<{ name: string; active: boolean }[]> {
    const r = await this.command("LISTSCRIPTS");
    if (r.status !== "OK") throw new SieveConnectionError(`LISTSCRIPTS: ${r.statusLine}`);
    const out: { name: string; active: boolean }[] = [];
    for (const line of r.lines) {
      const m = /^"((?:[^"\\]|\\.)*)"(\s+ACTIVE)?\s*$/i.exec(line);
      if (m) out.push({ name: m[1].replace(/\\(.)/g, "$1"), active: Boolean(m[2]) });
    }
    return out;
  }

  async getScript(name: string): Promise<string | null> {
    const r = await this.command(`GETSCRIPT ${quote(name)}`);
    if (r.status === "NO") return null; // nonexistent
    if (r.status !== "OK") throw new SieveConnectionError(`GETSCRIPT: ${r.statusLine}`);
    return r.literals.length ? Buffer.concat(r.literals).toString("utf8") : "";
  }

  async putScript(name: string, content: string): Promise<SieveResponse> {
    const body = Buffer.from(content, "utf8");
    const cmd = Buffer.concat([
      Buffer.from(`PUTSCRIPT ${quote(name)} {${body.length}+}\r\n`, "utf8"),
      body,
      Buffer.from("\r\n", "utf8"),
    ]);
    return this.command(cmd);
  }

  async setActive(name: string): Promise<SieveResponse> {
    return this.command(`SETACTIVE ${quote(name)}`); // name "" deactivates all
  }

  async logout(): Promise<void> {
    this.closed = true;
    try {
      const p = this.awaitResponse("LOGOUT");
      this.socket.write("LOGOUT\r\n");
      await Promise.race([p, new Promise((res) => setTimeout(res, 1500))]);
    } catch {
      /* closing anyway */
    } finally {
      this.socket.destroy();
    }
  }
}

/**
 * Verify a mailbox owner's credentials against Dovecot.
 * Returns true/false for auth outcome; throws SieveConnectionError when the
 * mailserver is unreachable (callers must surface 503, not "wrong password").
 */
export async function verifyMailboxCredentials(email: string, password: string): Promise<boolean> {
  const c = new ManageSieveClient();
  await c.connect();
  try {
    const r = await c.authenticatePlain(email, password);
    return r.status === "OK";
  } finally {
    await c.logout();
  }
}

/**
 * Open an authenticated ManageSieve session for `mailbox` using the app's Dovecot
 * master account (env MASTER_SIEVE_USER / MASTER_SIEVE_PASSWORD). Caller MUST have
 * passed an RBAC check first, and MUST call logout().
 */
export async function openMasterSieve(mailbox: string): Promise<ManageSieveClient> {
  const user = process.env.MASTER_SIEVE_USER;
  const pass = process.env.MASTER_SIEVE_PASSWORD;
  if (!user || !pass) throw new SieveConnectionError("master sieve credentials not configured");
  const c = new ManageSieveClient();
  await c.connect();
  // authenticatePlain can reject (e.g. op timeout) before the status check — always
  // release the connection on any error so the socket never leaks.
  try {
    const r = await c.authenticatePlain(user, pass, mailbox);
    if (r.status !== "OK") throw new SieveConnectionError(`master auth failed: ${r.statusLine}`);
    return c;
  } catch (err) {
    await c.logout();
    throw err;
  }
}

export type { ManageSieveClient };
