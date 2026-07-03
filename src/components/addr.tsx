import { cn } from "@/lib/utils";

/**
 * Two-tone mono rendering of an email address — the SutazMail signature detail
 * (DESIGN-DIRECTION §4): local part in foreground, @domain muted. Server-safe.
 */
export function Addr({ email, className }: { email: string; className?: string }) {
  const at = email.lastIndexOf("@");
  const local = at > 0 ? email.slice(0, at) : email;
  const domain = at > 0 ? email.slice(at) : "";
  return (
    <span className={cn("font-mono text-[0.8125rem]", className)} title={email}>
      <span className="text-foreground">{local}</span>
      <span className="text-muted-foreground">{domain}</span>
    </span>
  );
}
