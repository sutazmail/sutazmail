import { describe, it, expect } from "vitest";
import { dnsRecordsFor, defaultSettings } from "./settings";

describe("dnsRecordsFor", () => {
  it("substitutes {domain} and {mailHost} from settings", () => {
    const s = { ...defaultSettings(), mailHost: "mail.example.net" };
    const rec = dnsRecordsFor("acme.com", s);
    const byType = Object.fromEntries(rec.map((r) => [r.type, r]));
    expect(byType["MX"].host).toBe("acme.com.");
    expect(byType["MX"].value).toBe("10 mail.example.net.");
    expect(byType["TXT (SPF)"].value).toBe("v=spf1 mx ~all");
    expect(byType["TXT (DMARC)"].host).toBe("_dmarc.acme.com.");
    expect(byType["TXT (DMARC)"].value).toContain("postmaster@acme.com");
  });

  it("honors a custom DMARC template", () => {
    const s = { ...defaultSettings(), dnsDmarc: "v=DMARC1; p=reject; rua=mailto:dmarc@{domain}" };
    const rec = dnsRecordsFor("x.io", s);
    expect(rec.find((r) => r.type === "TXT (DMARC)")!.value).toBe(
      "v=DMARC1; p=reject; rua=mailto:dmarc@x.io",
    );
  });
});

describe("defaultSettings", () => {
  it("has the expected mail-profile defaults", () => {
    const s = defaultSettings();
    expect(s.imapSslPort).toBe("993");
    expect(s.smtpSslPort).toBe("465");
    expect(s.imapStarttlsPort).toBe("143");
    expect(s.smtpStarttlsPort).toBe("587");
  });
});
