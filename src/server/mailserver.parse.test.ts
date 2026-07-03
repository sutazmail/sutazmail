import { describe, it, expect } from "vitest";
import { parseAccounts, parseAliases } from "./mailserver";

const EMAIL_LIST = `* admin@tottynotti.com ( 12M / 1G ) [1%]
* gm@tottynotti.com ( 0B / ~ ) [0%]
* info@tottynotti.com ( 500M / 2G ) [24%]
* sourcing@tottynotti.com
* hello@sutaz.ca ( 3M / 1G ) [0%]
* noreply@sutazstays.com ( 1M / ~ ) [0%]
`;

describe("parseAccounts", () => {
  const accounts = parseAccounts(EMAIL_LIST);

  it("parses one entry per account line", () => {
    expect(accounts).toHaveLength(6);
  });

  it("splits mailbox into user + domain", () => {
    const admin = accounts.find((a) => a.mailbox === "admin@tottynotti.com");
    expect(admin).toBeDefined();
    expect(admin!.user).toBe("admin");
    expect(admin!.domain).toBe("tottynotti.com");
  });

  it("parses a quota line", () => {
    const info = accounts.find((a) => a.mailbox === "info@tottynotti.com")!;
    expect(info.used).toBe("500M");
    expect(info.total).toBe("2G");
    expect(info.percent).toBe(24);
  });

  it("maps ~ total to 'unlimited'", () => {
    const gm = accounts.find((a) => a.mailbox === "gm@tottynotti.com")!;
    expect(gm.total).toBe("unlimited");
    expect(gm.used).toBe("0B");
    expect(gm.percent).toBe(0);
  });

  it("handles a no-quota line", () => {
    const sourcing = accounts.find((a) => a.mailbox === "sourcing@tottynotti.com")!;
    expect(sourcing.used).toBeNull();
    expect(sourcing.total).toBeNull();
    expect(sourcing.percent).toBeNull();
  });

  it("ignores non-account lines", () => {
    expect(parseAccounts("no bullet here\n\n")).toHaveLength(0);
  });
});

const ALIAS_LIST = `* postmaster@tottynotti.com admin@tottynotti.com
* sales@sutaz.ca hello@sutaz.ca
* /^spam@.*/ info@tottynotti.com
`;

describe("parseAliases", () => {
  const aliases = parseAliases(ALIAS_LIST);

  it("parses one entry per alias line", () => {
    expect(aliases).toHaveLength(3);
  });

  it("parses source and recipient", () => {
    expect(aliases[0]).toEqual({
      source: "postmaster@tottynotti.com",
      recipient: "admin@tottynotti.com",
    });
  });

  it("parses a regex alias source", () => {
    const regex = aliases.find((a) => a.source === "/^spam@.*/")!;
    expect(regex).toBeDefined();
    expect(regex.recipient).toBe("info@tottynotti.com");
  });

  it("ignores non-alias lines", () => {
    expect(parseAliases("header line\n")).toHaveLength(0);
  });
});
