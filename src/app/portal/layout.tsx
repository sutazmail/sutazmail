import { requireUser } from "@/server/session";
import { logoutAction } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Addr } from "@/components/addr";
import { PortalTabs } from "./portal-tabs";

/**
 * Self-service portal shell: no sidebar — a calm, centered column with top tabs
 * (DESIGN-DIRECTION §2). Any authenticated user may open it; mailbox features
 * themselves check the USER role.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
      <header className="flex h-14 items-center justify-between gap-4">
        <span className="font-heading text-base font-semibold">
          Sutaz<span className="text-primary">Mail</span>
        </span>
        <div className="flex items-center gap-3">
          <Addr email={ctx.user.email} className="hidden sm:inline" />
          <ThemeToggle />
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
              Log out
            </Button>
          </form>
        </div>
      </header>
      <PortalTabs mailbox={ctx.user.role === "USER"} />
      <main className="flex-1 py-6">{children}</main>
    </div>
  );
}
