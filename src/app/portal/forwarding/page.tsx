import { requireUser } from "@/server/session";
import { getRules, EMPTY_RULES } from "@/server/sieve-rules";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForwardingForm } from "./forwarding-form";

export const dynamic = "force-dynamic";

export default async function ForwardingPage() {
  const ctx = await requireUser();
  if (ctx.user.role !== "USER") {
    return (
      <div className="space-y-6">
        <PageHeader title="Forwarding" />
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Forwarding is available on mailbox accounts.
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
        title="Forwarding"
        description="Send a copy of incoming mail to another address."
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
            <CardTitle className="text-base">Forward my mail</CardTitle>
            <CardDescription>Incoming messages are redirected to the address you set.</CardDescription>
          </CardHeader>
          <CardContent>
            <ForwardingForm initial={rules.forwarding} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
