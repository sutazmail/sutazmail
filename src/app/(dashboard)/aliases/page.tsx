import { requireAdmin } from "@/server/session";
import { listAliases } from "@/server/mailserver";
import { AddAliasDialog } from "@/components/aliases/add-alias-dialog";
import { DeleteAliasButton } from "@/components/aliases/delete-alias-button";
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

export default async function AliasesPage() {
  await requireAdmin();
  const aliases = await listAliases();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Aliases</h1>
        <AddAliasDialog />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aliases.map((a) => (
                <TableRow key={`${a.source}->${a.recipient}`}>
                  <TableCell className="font-medium">{a.source}</TableCell>
                  <TableCell className="text-muted-foreground">{a.recipient}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <DeleteAliasButton source={a.source} recipient={a.recipient} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {aliases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No aliases yet.
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
