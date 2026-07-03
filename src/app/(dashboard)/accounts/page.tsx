import { requireAdmin } from "@/server/session";
import { listAccounts, type Account } from "@/server/mailserver";
import { getSettings } from "@/server/settings";
import { AddAccountDialog } from "@/components/accounts/add-account-dialog";
import { AccountRowActions } from "@/components/accounts/account-row-actions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function storageLabel(a: Account): string {
  if (a.used === null || a.total === null) return "—";
  return `${a.used} / ${a.total}${a.percent !== null ? ` (${a.percent}%)` : ""}`;
}

export default async function AccountsPage() {
  await requireAdmin();
  const wm = (await getSettings()).webmailUrl;
  const accounts = await listAccounts();
  const sorted = [...accounts].sort((a, b) =>
    a.domain === b.domain ? a.user.localeCompare(b.user) : a.domain.localeCompare(b.domain),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Accounts</h1>
        <AddAccountDialog webmailBase={wm} />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mailbox</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((a) => (
                <TableRow key={a.mailbox}>
                  <TableCell className="font-medium">{a.mailbox}</TableCell>
                  <TableCell className="text-muted-foreground">{storageLabel(a)}</TableCell>
                  <TableCell>
                    <AccountRowActions email={a.mailbox} webmailBase={wm} />
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No accounts yet.
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
