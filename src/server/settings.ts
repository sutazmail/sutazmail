/**
 * Editable app configuration, persisted in the Setting table so operators change the
 * mail connection profile, webmail URL, and DNS templates from the UI — no redeploy.
 * Defaults fall back to env (backward compatible) then to sane built-ins.
 */
import { prisma } from "./db";

export interface AppSettings {
  webmailUrl: string;
  mailHost: string;
  imapSslPort: string;
  imapStarttlsPort: string;
  smtpSslPort: string;
  smtpStarttlsPort: string;
  dnsMx: string; // template, {mailHost} substituted
  dnsSpf: string; // template, {domain}/{mailHost}
  dnsDmarc: string; // template, {domain}
}

/** Map each field to its stable DB key. */
const KEYS: Record<keyof AppSettings, string> = {
  webmailUrl: "webmail.url",
  mailHost: "mail.host",
  imapSslPort: "imap.sslPort",
  imapStarttlsPort: "imap.starttlsPort",
  smtpSslPort: "smtp.sslPort",
  smtpStarttlsPort: "smtp.starttlsPort",
  dnsMx: "dns.mx",
  dnsSpf: "dns.spf",
  dnsDmarc: "dns.dmarc",
};

export function defaultSettings(): AppSettings {
  return {
    webmailUrl: (process.env.WEBMAIL_URL || "https://webmail.sutaz.synology.me").replace(/\/+$/, ""),
    mailHost: process.env.MAIL_HOSTNAME || "mail.tottynotti.com",
    imapSslPort: "993",
    imapStarttlsPort: "143",
    smtpSslPort: "465",
    smtpStarttlsPort: "587",
    dnsMx: "10 {mailHost}.",
    dnsSpf: "v=spf1 mx ~all",
    dnsDmarc: "v=DMARC1; p=none; rua=mailto:postmaster@{domain}",
  };
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out = defaultSettings();
  for (const field of Object.keys(KEYS) as (keyof AppSettings)[]) {
    const v = stored.get(KEYS[field]);
    if (v !== undefined && v !== "") out[field] = v;
  }
  return out;
}

const FIELD_LABELS: Record<keyof AppSettings, string> = {
  webmailUrl: "Webmail URL",
  mailHost: "Mail server host",
  imapSslPort: "IMAP SSL port",
  imapStarttlsPort: "IMAP STARTTLS port",
  smtpSslPort: "SMTP SSL port",
  smtpStarttlsPort: "SMTP STARTTLS port",
  dnsMx: "DNS MX template",
  dnsSpf: "DNS SPF template",
  dnsDmarc: "DNS DMARC template",
};

function validate(field: keyof AppSettings, value: string): void {
  const v = value.trim();
  if (v === "") throw new Error(`${FIELD_LABELS[field]} cannot be empty`);
  if (field === "webmailUrl" && !/^https?:\/\/[^\s]+$/i.test(v)) {
    throw new Error("Webmail URL must start with http:// or https://");
  }
  if (field === "mailHost" && !/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)) {
    throw new Error("Mail server host must be a valid hostname");
  }
  if (field.endsWith("Port")) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error(`${FIELD_LABELS[field]} must be a port 1–65535`);
    }
  }
}

/** Upsert only the provided fields; validates each. */
export async function setSettings(patch: Partial<AppSettings>): Promise<void> {
  const entries = Object.entries(patch) as [keyof AppSettings, string][];
  for (const [field, value] of entries) {
    if (!(field in KEYS)) continue;
    validate(field, value);
  }
  for (const [field, value] of entries) {
    if (!(field in KEYS)) continue;
    const key = KEYS[field];
    const val = value.trim();
    await prisma.setting.upsert({ where: { key }, update: { value: val }, create: { key, value: val } });
  }
}

export interface DnsRecord {
  type: string;
  host: string;
  value: string;
}

/** Render a domain's publishable DNS from the editable templates. */
export function dnsRecordsFor(domain: string, s: AppSettings): DnsRecord[] {
  const fill = (t: string) => t.replaceAll("{domain}", domain).replaceAll("{mailHost}", s.mailHost);
  return [
    { type: "MX", host: `${domain}.`, value: fill(s.dnsMx) },
    { type: "TXT (SPF)", host: `${domain}.`, value: fill(s.dnsSpf) },
    { type: "TXT (DMARC)", host: `_dmarc.${domain}.`, value: fill(s.dnsDmarc) },
  ];
}

export const SETTINGS_FIELDS = Object.keys(KEYS) as (keyof AppSettings)[];
export { FIELD_LABELS };
