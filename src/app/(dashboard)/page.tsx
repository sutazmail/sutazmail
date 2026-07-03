import Link from "next/link";
import { requireAdmin } from "@/server/session";
import { listAccounts, listAliases, listDomains, serverStatus } from "@/server/mailserver";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireAdmin();

  const status = await serverStatus();

  if (!status.reachable) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Header status={status.reachable} />
        <Card className="border-destructive/40 ring-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Cannot reach mail server</CardTitle>
            <CardDescription>
              {status.error ?? "The docker-mailserver REST API did not respond."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const [accounts, aliases, domains] = await Promise.all([
    listAccounts(),
    listAliases(),
    listDomains(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Header status={status.reachable} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Accounts" value={accounts.length} href="/accounts" />
        <StatCard label="Aliases" value={aliases.length} href="/aliases" />
        <StatCard label="Domains" value={domains.length} href="/domains" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
          <CardDescription>Mailboxes per domain</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead className="text-right">Mailboxes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((d) => (
                <TableRow key={d.domain} className="relative cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <Link href="/domains" className="after:absolute after:inset-0">
                      {d.domain}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{d.mailboxes}</TableCell>
                </TableRow>
              ))}
              {domains.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    No domains found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Header({ status }: { status: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
      <Badge variant={status ? "default" : "destructive"}>
        {status ? "Mail server online" : "Mail server offline"}
      </Badge>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="transition-colors hover:border-primary/50 hover:bg-muted/30">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl">{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}
