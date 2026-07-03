import { LayoutDashboardIcon, MailIcon, ForwardIcon, GlobeIcon, LogOutIcon, UserIcon, SettingsIcon } from "lucide-react";
import { requireAdmin } from "@/server/session";
import { logoutAction } from "@/app/login/actions";
import { NavLink } from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboardIcon className="size-4" /> },
  { href: "/accounts", label: "Accounts", icon: <MailIcon className="size-4" /> },
  { href: "/aliases", label: "Aliases", icon: <ForwardIcon className="size-4" /> },
  { href: "/domains", label: "Domains", icon: <GlobeIcon className="size-4" /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon className="size-4" /> },
  { href: "/portal/security", label: "My account", icon: <UserIcon className="size-4" /> },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="font-heading text-base font-semibold">
            Sutaz<span className="text-primary">Mail</span>
          </span>
          <ThemeToggle />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <form action={logoutAction} className="p-2">
          <Button type="submit" variant="ghost" className="w-full justify-start text-muted-foreground">
            <LogOutIcon className="size-4" />
            Log out
          </Button>
        </form>
      </aside>
      <main className="flex-1 overflow-x-hidden p-6">{children}</main>
    </div>
  );
}
