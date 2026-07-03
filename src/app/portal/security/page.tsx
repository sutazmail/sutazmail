import { requireUser } from "@/server/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "./password-form";

export default async function PortalSecurityPage() {
  const ctx = await requireUser();
  const isMailbox = ctx.user.role === "USER";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Keep your account safe — change your password regularly."
      />

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>
            {isMailbox
              ? "This changes the password you use for email apps (IMAP/SMTP) and this portal."
              : "This changes the password for your admin sign-in."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
