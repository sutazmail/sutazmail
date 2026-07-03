import { describe, expect, it } from "vitest";
import { canonicalType, validateDnsInput } from "./dns";

describe("canonicalType", () => {
  it("strips template labels", () => {
    expect(canonicalType("TXT (SPF)")).toBe("TXT");
    expect(canonicalType("TXT (DMARC)")).toBe("TXT");
  });
  it("passes canonical types through", () => {
    expect(canonicalType("MX")).toBe("MX");
    expect(canonicalType(" cname ")).toBe("CNAME");
  });
});

describe("validateDnsInput", () => {
  const ok = { type: "MX", host: "example.com.", value: "10 mail.example.com." };

  it("accepts a valid record and trims fields", () => {
    expect(validateDnsInput({ ...ok, value: "  10 mail.example.com.  " })).toEqual(ok);
  });
  it("accepts template-labelled TXT types", () => {
    expect(validateDnsInput({ type: "TXT (SPF)", host: "example.com.", value: "v=spf1 mx ~all" }).type).toBe(
      "TXT",
    );
  });
  it("accepts underscore and wildcard hosts", () => {
    expect(() => validateDnsInput({ ...ok, type: "TXT", host: "_dmarc.example.com." })).not.toThrow();
    expect(() => validateDnsInput({ ...ok, type: "CNAME", host: "*.example.com." })).not.toThrow();
    expect(() => validateDnsInput({ ...ok, type: "TXT", host: "@" })).not.toThrow();
  });
  it("rejects unknown types", () => {
    expect(() => validateDnsInput({ ...ok, type: "PTR" })).toThrow(/Record type/);
    expect(() => validateDnsInput({ ...ok, type: "" })).toThrow(/Record type/);
  });
  it("rejects bad hosts", () => {
    expect(() => validateDnsInput({ ...ok, host: "" })).toThrow(/Host/);
    expect(() => validateDnsInput({ ...ok, host: "a".repeat(254) })).toThrow(/Host/);
    expect(() => validateDnsInput({ ...ok, host: "bad host" })).toThrow(/Host/);
    expect(() => validateDnsInput({ ...ok, host: "bad;host" })).toThrow(/Host/);
  });
  it("rejects bad values", () => {
    expect(() => validateDnsInput({ ...ok, value: "" })).toThrow(/Value/);
    expect(() => validateDnsInput({ ...ok, value: "x".repeat(1025) })).toThrow(/Value/);
    expect(() => validateDnsInput({ ...ok, value: "a\x00b" })).toThrow(/control/);
  });
});
