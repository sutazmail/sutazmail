import { requireUser } from "@/server/session";
import { getRules, EMPTY_RULES } from "@/server/sieve-rules";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutoresponderForm } from "./autoresponder-form";

export const dynamic = "force-dynamic";

export default async function AutoresponderPage() {
  const ctx = await requireUser();
  if (ctx.user.role !== "USER") {
    return (
      <div className="space-y-6">
        <PageHeader title="Auto-responder" />
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Auto-responder is available on mailbox accounts.
          </CardContent>
        </Card>
      </div>
    );
  }

  let rules = EMPTY_RULES;
  let unavailable = false;
  try {
    rules = await getRules(ctx.user.email);
  } catch {
    unavailable = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto-responder"
        description="Automatically reply to incoming mail while you're away."
      />
      {unavailable ? (
        <Card>
          <CardContent className="py-6">
            <StatusBadge tone="warning">Mail server unreachable — try again shortly</StatusBadge>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-base">Vacation reply</CardTitle>
            <CardDescription>
              Each sender gets your reply at most once every few days, so you don&apos;t spam them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AutoresponderForm initial={rules.autoresponder} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
