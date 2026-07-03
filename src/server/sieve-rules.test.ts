import { describe, it, expect } from "vitest";
import {
  validateRules,
  renderScript,
  parseScript,
  importFromRaw,
  EMPTY_RULES,
  type MailboxRules,
} from "./sieve-rules";

const rules: MailboxRules = {
  forwarding: { enabled: true, to: "Other@Example.com", keepCopy: true },
  autoresponder: { enabled: true, days: 5, subject: 'Away "OOO"', message: "Back soon\nCheers" },
};

describe("validateRules", () => {
  it("lowercases + validates the forward address", () => {
    expect(validateRules(rules).forwarding.to).toBe("other@example.com");
  });

  it("rejects an invalid forward address when enabled", () => {
    expect(() =>
      validateRules({ ...rules, forwarding: { enabled: true, to: "nope", keepCopy: false } }),
    ).toThrow();
  });

  it("ignores the forward address when disabled", () => {
    const r = validateRules({
      ...rules,
      forwarding: { enabled: false, to: "nope", keepCopy: true },
    });
    expect(r.forwarding.to).toBe("");
  });

  it("rejects out-of-range vacation days", () => {
    expect(() =>
      validateRules({ ...rules, autoresponder: { ...rules.autoresponder, days: 0 } }),
    ).toThrow();
    expect(() =>
      validateRules({ ...rules, autoresponder: { ...rules.autoresponder, days: 999 } }),
    ).toThrow();
  });

  it("requires a message when the autoresponder is on", () => {
    expect(() =>
      validateRules({ ...rules, autoresponder: { ...rules.autoresponder, message: "  " } }),
    ).toThrow();
  });

  it("rejects control characters in the message", () => {
    expect(() =>
      validateRules({
        ...rules,
        autoresponder: { ...rules.autoresponder, message: `bad${String.fromCharCode(0)}` },
      }),
    ).toThrow();
  });
});

describe("renderScript", () => {
  it("escapes quotes/backslashes into Sieve strings", () => {
    const script = renderScript(validateRules(rules));
    expect(script).toContain('redirect :copy "other@example.com";');
    expect(script).toContain('vacation :days 5 :subject "Away \\"OOO\\""');
  });

  it("declares only the requires it uses", () => {
    const script = renderScript(
      validateRules({
        forwarding: { enabled: false, to: "", keepCopy: true },
        autoresponder: { enabled: true, days: 1, subject: "", message: "hi" },
      }),
    );
    expect(script).toContain('require ["vacation"];');
    expect(script).not.toContain("copy");
  });

  it("uses plain redirect (no :copy) when not keeping a copy", () => {
    const script = renderScript(
      validateRules({
        forwarding: { enabled: true, to: "x@y.com", keepCopy: false },
        autoresponder: EMPTY_RULES.autoresponder,
      }),
    );
    expect(script).toContain('redirect "x@y.com";');
    expect(script).not.toContain(":copy");
  });
});

describe("round-trip", () => {
  it("parseScript recovers the settings renderScript wrote", () => {
    const v = validateRules(rules);
    const parsed = parseScript(renderScript(v));
    expect(parsed).toEqual(v);
  });

  it("returns null for a script without our marker", () => {
    expect(parseScript('require ["fileinto"];\nkeep;')).toBeNull();
    expect(parseScript(null)).toBeNull();
  });
});

describe("importFromRaw (preserve pre-existing forwards)", () => {
  it("imports a DMS-style redirect :copy forward", () => {
    const raw =
      'require ["copy"];\n\n# Forward all incoming emails to Gmail while keeping a local copy\nredirect :copy "office.tottynotti@gmail.com";\n';
    const r = importFromRaw(raw);
    expect(r.forwarding).toEqual({ enabled: true, to: "office.tottynotti@gmail.com", keepCopy: true });
    expect(r.autoresponder.enabled).toBe(false);
  });

  it("imports a plain redirect (no copy) as non-keeping forward", () => {
    const r = importFromRaw('redirect "elsewhere@example.com";');
    expect(r.forwarding.enabled).toBe(true);
    expect(r.forwarding.keepCopy).toBe(false);
    expect(r.forwarding.to).toBe("elsewhere@example.com");
  });

  it("imports a vacation script", () => {
    const raw = 'require ["vacation"];\nvacation :days 5 :subject "Away" "Back Monday.";';
    const r = importFromRaw(raw);
    expect(r.autoresponder).toEqual({ enabled: true, days: 5, subject: "Away", message: "Back Monday." });
  });

  it("returns empty rules for a script with no forward/vacation", () => {
    expect(importFromRaw('require ["fileinto"];\nfileinto "Archive";')).toEqual(EMPTY_RULES);
  });

  it("keeps a vacation message that contains a semicolon (no truncation)", () => {
    const r = importFromRaw('require ["vacation"];\nvacation :days 5 :subject "OOO" "I\'m out; email boss.";');
    expect(r.autoresponder.subject).toBe("OOO");
    expect(r.autoresponder.message).toBe("I'm out; email boss.");
  });

  it("does NOT import an if-guarded redirect as unconditional forwarding", () => {
    const raw = 'require ["fileinto"];\nif header :contains "from" "spam" { redirect "blackhole@x.com"; }\nkeep;';
    expect(importFromRaw(raw).forwarding.enabled).toBe(false);
  });

  it("still imports a top-level redirect that follows an if-block", () => {
    const raw = 'if header :contains "subject" "x" { discard; }\nredirect :copy "real@example.com";';
    const r = importFromRaw(raw);
    expect(r.forwarding).toEqual({ enabled: true, to: "real@example.com", keepCopy: true });
  });
});
