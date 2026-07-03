import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/page-header";
import { MailClientSettings } from "@/components/mail-client-settings";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function EmailAppPage() {
  const ctx = await requireUser();
  const isMailbox = ctx.user.role === "USER";
  const s = await getSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connect your email app"
        description="Use these settings in Thunderbird, Outlook, Apple Mail, or your phone."
      />

      {isMailbox ? (
        <>
          <MailClientSettings
            email={ctx.user.email}
            profile={{
              host: s.mailHost,
              imapSslPort: s.imapSslPort,
              imapStarttlsPort: s.imapStarttlsPort,
              smtpSslPort: s.smtpSslPort,
              smtpStarttlsPort: s.smtpStarttlsPort,
            }}
          />
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Sign in with your full email address ({" "}
              <span className="font-mono text-foreground">{ctx.user.email}</span> ) and your mailbox
              password. Change your password anytime under Security.
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Mail-app settings are shown for mailbox accounts.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
