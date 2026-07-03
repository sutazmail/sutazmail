import { requireAdmin } from "@/server/session";
import { listManagedDomains } from "@/server/domains";
import { DkimRecord } from "@/components/domains/dkim-record";
import { DnsRecords } from "@/components/domains/dns-records";
import { AddDomainDialog } from "@/components/domains/add-domain-dialog";
import { DeleteDomainButton } from "@/components/domains/delete-domain-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  await requireAdmin();
  const domains = await listManagedDomains();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Domains</h1>
        <AddDomainDialog />
      </div>

      {domains.length === 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>No domains yet. Add one to get started.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {domains.map((d) => (
            <Card key={d.name}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{d.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{d.org}</Badge>
                    <Badge variant="secondary">
                      {d.mailboxes} {d.mailboxes === 1 ? "mailbox" : "mailboxes"}
                    </Badge>
                    <DeleteDomainButton domain={d.name} mailboxes={d.mailboxes} />
                  </div>
                </div>
                <CardDescription>Publish these DNS records at your registrar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DnsRecords domain={d.name} customized={d.dnsCustomized} records={d.dns} />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">DKIM (TXT)</p>
                  {d.dkim ? (
                    <DkimRecord record={d.dkim} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      DKIM key not generated yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
