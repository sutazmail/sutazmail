import { requireUser } from "@/server/session";
import { prisma } from "@/server/db";
import { getQuota } from "@/server/mailserver";
import { Addr } from "@/components/addr";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

function formatKb(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export default async function PortalOverview() {
  const ctx = await requireUser();
  const isMailbox = ctx.user.role === "USER";

  const [org, quota] = await Promise.all([
    ctx.user.orgId ? prisma.org.findUnique({ where: { id: ctx.user.orgId } }) : null,
    isMailbox ? getQuota(ctx.user.email).catch(() => null) : null,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your mailbox"
        description={
          isMailbox
            ? "Manage your email account — password, storage, and settings."
            : "You are signed in with an admin account."
        }
      />

      {!isMailbox ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Admin accounts manage mailboxes from the{" "}
            <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
              admin console
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Addr email={ctx.user.email} className="text-base" />
              {org ? (
                <p className="text-sm text-muted-foreground">
                  Organization: <span className="text-foreground">{org.name}</span>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Storage</CardTitle>
              <CardDescription>Live usage from the mail server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {quota ? (
                <>
                  <p className="text-base font-semibold">
                    {formatKb(quota.storageUsedKb)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      of {quota.storageLimitKb ? formatKb(quota.storageLimitKb) : "unlimited"} ·{" "}
                      {quota.messages} messages
                    </span>
                  </p>
                  {quota.storageLimitKb ? (
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={quota.percent ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(quota.percent ?? 0, 100)}%` }}
                      />
                    </div>
                  ) : (
                    <StatusBadge tone="success">No storage limit</StatusBadge>
                  )}
                </>
              ) : (
                <StatusBadge tone="warning">Storage data unavailable right now</StatusBadge>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
