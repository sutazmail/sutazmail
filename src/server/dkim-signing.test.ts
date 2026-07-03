import { describe, expect, it } from "vitest";
import { addDomainToSigningConfig, removeDomainFromSigningConfig } from "./mailserver";

// Exact shape of the live /tmp/docker-mailserver/rspamd/override.d/dkim_signing.conf.
const CONF = `# documentation: https://rspamd.com/doc/modules/dkim_signing.html

enabled = true;

sign_authenticated = true;
sign_local = false;
try_fallback = false;

use_domain = "header";
use_redis = false; # don't change unless Redis also provides the DKIM keys
use_esld = true;
allow_username_mismatch = true;

check_pubkey = true; # you want to use this in the beginning

domain {
    tottynotti.com {
        path = "/tmp/docker-mailserver/rspamd/dkim/rsa-2048-mail-tottynotti.com.private.txt";
        selector = "mail";
    }
    sutaz.ca {
        path = "/tmp/docker-mailserver/rspamd/dkim/rsa-2048-mail-sutaz.ca.private.txt";
        selector = "mail";
    }
    sutazstays.com {
        path = "/tmp/docker-mailserver/rspamd/dkim/rsa-2048-mail-sutazstays.com.private.txt";
        selector = "mail";
    }
}
`;

const balanced = (s: string) => (s.match(/\{/g) ?? []).length === (s.match(/\}/g) ?? []).length;
const hasBlock = (s: string, d: string) =>
  new RegExp(`\\n[ \\t]*${d.replace(/\./g, "\\.")}[ \\t]*\\{`).test(s);

describe("addDomainToSigningConfig", () => {
  it("adds a new domain block, keeping the 3 existing ones", () => {
    const out = addDomainToSigningConfig(CONF, "new-domain.example");
    expect(hasBlock(out, "new-domain.example")).toBe(true);
    for (const d of ["tottynotti.com", "sutaz.ca", "sutazstays.com"]) {
      expect(hasBlock(out, d)).toBe(true);
    }
    expect(out).toContain(
      'path = "/tmp/docker-mailserver/rspamd/dkim/rsa-2048-mail-new-domain.example.private.txt";',
    );
    expect(out).toContain('selector = "mail";');
    expect(balanced(out)).toBe(true);
    expect(out.trimEnd().endsWith("}")).toBe(true);
  });

  it("is idempotent — adding an existing domain changes nothing", () => {
    expect(addDomainToSigningConfig(CONF, "sutaz.ca")).toBe(CONF);
    const once = addDomainToSigningConfig(CONF, "zap.example");
    expect(addDomainToSigningConfig(once, "zap.example")).toBe(once);
  });

  it("does not match a domain as a substring of another", () => {
    const out = addDomainToSigningConfig(CONF, "sutaz.can");
    expect(hasBlock(out, "sutaz.can")).toBe(true);
  });
});

describe("removeDomainFromSigningConfig", () => {
  it("add then remove returns the original config exactly", () => {
    const added = addDomainToSigningConfig(CONF, "zap.example");
    expect(removeDomainFromSigningConfig(added, "zap.example")).toBe(CONF);
  });

  it("removes only the target block, leaving the others + header intact", () => {
    const out = removeDomainFromSigningConfig(CONF, "sutaz.ca");
    expect(hasBlock(out, "sutaz.ca")).toBe(false);
    expect(hasBlock(out, "tottynotti.com")).toBe(true);
    expect(hasBlock(out, "sutazstays.com")).toBe(true);
    expect(out).toContain("enabled = true;");
    expect(out).toContain("check_pubkey = true;");
    expect(out).not.toContain("rsa-2048-mail-sutaz.ca.private.txt");
    expect(balanced(out)).toBe(true);
  });

  it("is a no-op for an absent domain", () => {
    expect(removeDomainFromSigningConfig(CONF, "not-there.example")).toBe(CONF);
  });
});
