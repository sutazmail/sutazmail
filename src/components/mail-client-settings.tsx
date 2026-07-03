"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MailProfile {
  host: string;
  imapSslPort: string;
  imapStarttlsPort: string;
  smtpSslPort: string;
  smtpStarttlsPort: string;
}

interface Row {
  label: string;
  value: string;
  hint?: string;
}

function CopyRow({ row }: { row: Row }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(row.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{row.label}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm">{row.value}</span>
        {row.hint ? <span className="text-xs text-muted-foreground">{row.hint}</span> : null}
        <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${row.label}`}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  );
}

function ServerBlock({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="divide-y">
        {rows.map((r) => (
          <CopyRow key={r.label} row={r} />
        ))}
      </div>
    </div>
  );
}

/** Everything a mail client needs. Server/ports come from the editable Settings profile. */
export function MailClientSettings({ email, profile }: { email: string; profile: MailProfile }) {
  const incoming: Row[] = [
    { label: "Server", value: profile.host },
    { label: "Port", value: profile.imapSslPort, hint: "SSL/TLS" },
    { label: "Username", value: email },
    { label: "Alternative", value: profile.imapStarttlsPort, hint: "STARTTLS" },
  ];
  const outgoing: Row[] = [
    { label: "Server", value: profile.host },
    { label: "Port", value: profile.smtpSslPort, hint: "SSL/TLS" },
    { label: "Username", value: email },
    { label: "Alternative", value: profile.smtpStarttlsPort, hint: "STARTTLS" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ServerBlock title="Incoming mail (IMAP)" rows={incoming} />
      <ServerBlock title="Outgoing mail (SMTP)" rows={outgoing} />
    </div>
  );
}
