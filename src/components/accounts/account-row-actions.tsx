"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLinkIcon, SparklesIcon } from "lucide-react";
import {
  updatePasswordAction,
  deleteAccountAction,
  type ActionResult,
} from "@/app/actions";
import { genPassword } from "@/server/validate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AccountRowActions({ email, webmailBase }: { email: string; webmailBase: string }) {
  return (
    <div className="flex justify-end gap-2">
      <a
        href={`${webmailBase}/?_user=${encodeURIComponent(email)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "outline", size: "sm" })}
        title={`Open webmail for ${email}`}
      >
        <ExternalLinkIcon />
        Webmail
      </a>
      <ChangePasswordDialog email={email} />
      <DeleteAccountDialog email={email} />
    </div>
  );
}

function ChangePasswordDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updatePasswordAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Password changed");
      setOpen(false);
      setPassword("");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Change password</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <div className="flex gap-2">
              <Input
                id="new-password"
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
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    deleteAccountAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Account deleted");
      setOpen(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>Delete</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            Permanently delete <span className="font-medium text-foreground">{email}</span> and its
            mailbox? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="email" value={email} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
