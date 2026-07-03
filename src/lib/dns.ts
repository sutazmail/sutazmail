/**
 * Pure DNS-record helpers shared by the server module (dns-records.ts), the client
 * editor component, and unit tests. Keep this file free of server-only imports.
 */

export const DNS_RECORD_TYPES = ["MX", "TXT", "A", "AAAA", "CNAME", "SRV", "NS", "CAA"] as const;

export interface EditableDnsRecord {
  id: string; // DB cuid once customized; "tpl:<n>" while template-backed
  type: string;
  host: string;
  value: string;
}

/** "TXT (SPF)" (template label) → "TXT"; pass-through for canonical types. */
export function canonicalType(type: string): string {
  return type.trim().toUpperCase().replace(/\s*\(.*\)$/, "");
}

/** Validate record fields; returns trimmed values or throws a user-facing Error. */
export function validateDnsInput(input: { type: string; host: string; value: string }): {
  type: string;
  host: string;
  value: string;
} {
  const type = canonicalType(input.type);
  if (!(DNS_RECORD_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Record type must be one of ${DNS_RECORD_TYPES.join(", ")}`);
  }
  const host = input.host.trim();
  if (host === "" || host.length > 253) throw new Error("Host must be 1–253 characters");
  if (!/^[A-Za-z0-9._@*-]+\.?$/.test(host)) {
    throw new Error("Host may only contain letters, digits, dots, hyphens, underscores, @ and *");
  }
  const value = input.value.trim();
  if (value === "" || value.length > 1024) throw new Error("Value must be 1–1024 characters");
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) throw new Error("Value must not contain control characters");
  return { type, host, value };
}
