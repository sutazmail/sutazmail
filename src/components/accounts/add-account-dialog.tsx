"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ExternalLinkIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { addAccountAction, type ActionResult } from "@/app/actions";
import { genPassword } from "@/server/validate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AddAccountDialog({ webmailBase }: { webmailBase: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // After a successful create we keep the credentials on screen so the operator can
  // copy them and jump straight into the new mailbox's webmail.
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  // Handle the result inside the action (runs in the submit transition) rather than in
  // an effect, so we never call setState synchronously from useEffect.
  const [, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, fd) => {
      const res = await addAccountAction(prev, fd);
      if (res.ok) {
        toast.success("Account created");
        setCreated({ email, password });
      } else {
        toast.error(res.error);
      }
      return res;
    },
    null,
  );

  function reset() {
    setEmail("");
    setPassword("");
    setCreated(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Add account
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                Save these credentials — the password is shown only now.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-mono">{created.email}</span>
                </div>
                <div className="mt-1 flex justify-between gap-2">
                  <span className="text-muted-foreground">Password</span>
                  <span className="font-mono break-all">{created.password}</span>
                </div>
              </div>
              <a
                href={`${webmailBase}/?_user=${encodeURIComponent(created.email)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ className: "w-full" })}
              >
                <ExternalLinkIcon />
                Open webmail for this account
              </a>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Add another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add account</DialogTitle>
              <DialogDescription>Create a new mailbox on the mail server.</DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add-email">Email</Label>
                <Input
                  id="add-email"
                  name="email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-password">Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="add-password"
                    name="password"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPassword(genPassword())}
                    aria-label="Generate password"
                  >
                    <SparklesIcon />
                    Generate
                  </Button>
                </div>
              </div>
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
