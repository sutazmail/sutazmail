"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ALL_TABS = [
  { href: "/portal", label: "Overview", mailboxOnly: false },
  { href: "/portal/email-app", label: "Email app", mailboxOnly: true },
  { href: "/portal/autoresponder", label: "Auto-responder", mailboxOnly: true },
  { href: "/portal/forwarding", label: "Forwarding", mailboxOnly: true },
  { href: "/portal/security", label: "Security", mailboxOnly: false },
];

export function PortalTabs({ mailbox }: { mailbox: boolean }) {
  const pathname = usePathname();
  const tabs = ALL_TABS.filter((t) => mailbox || !t.mailboxOnly);

  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Portal sections">
      {tabs.map((tab) => {
        const active =
          tab.href === "/portal" ? pathname === "/portal" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
