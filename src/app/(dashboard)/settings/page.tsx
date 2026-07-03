import { requireAdmin } from "@/server/session";
import { getSettings, FIELD_LABELS } from "@/server/settings";
import { SettingsForm } from "@/components/settings/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();

  const groups = [
    {
      title: "Webmail",
      fields: [
        { name: "webmailUrl", label: FIELD_LABELS.webmailUrl, value: s.webmailUrl, hint: "Base URL of Roundcube/webmail." },
      ],
    },
    {
      title: "Mail server (email-app profile)",
      fields: [
        { name: "mailHost", label: FIELD_LABELS.mailHost, value: s.mailHost, hint: "Host clients connect to (IMAP/SMTP)." },
        { name: "imapSslPort", label: FIELD_LABELS.imapSslPort, value: s.imapSslPort },
        { name: "imapStarttlsPort", label: FIELD_LABELS.imapStarttlsPort, value: s.imapStarttlsPort },
        { name: "smtpSslPort", label: FIELD_LABELS.smtpSslPort, value: s.smtpSslPort },
        { name: "smtpStarttlsPort", label: FIELD_LABELS.smtpStarttlsPort, value: s.smtpStarttlsPort },
      ],
    },
    {
      title: "DNS templates",
      fields: [
        { name: "dnsMx", label: FIELD_LABELS.dnsMx, value: s.dnsMx, hint: "Use {mailHost} as a placeholder." },
        { name: "dnsSpf", label: FIELD_LABELS.dnsSpf, value: s.dnsSpf, hint: "Use {domain}/{mailHost}." },
        { name: "dnsDmarc", label: FIELD_LABELS.dnsDmarc, value: s.dnsDmarc, hint: "Use {domain} as a placeholder." },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize the mail connection profile, webmail link, and DNS templates — no redeploy needed.
        </p>
      </div>
      <SettingsForm groups={groups} />
    </div>
  );
}
