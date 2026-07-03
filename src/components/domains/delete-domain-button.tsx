"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { deleteDomainAction, type ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
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

export function DeleteDomainButton({ domain, mailboxes }: { domain: string; mailboxes: number }) {
  const [open, setOpen] = useState(false);
  const [, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, fd) => {
      const res = await deleteDomainAction(prev, fd);
      if (res.ok) {
        toast.success(`Domain ${domain} deleted`);
        setOpen(false);
      } else {
        toast.error(res.error);
      }
      return res;
    },
    null,
  );

  // Guard in the UI too: a domain with mailboxes can't be deleted (the action enforces
  // this as well). Disable with an explanatory tooltip rather than let it fail.
  if (mailboxes > 0) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        title={`Remove its ${mailboxes} mailbox${mailboxes === 1 ? "" : "es"} before deleting`}
        aria-label={`Delete domain ${domain} (disabled — has mailboxes)`}
      >
        <Trash2Icon />
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Delete domain ${domain}`} />
        }
      >
        <Trash2Icon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete domain</DialogTitle>
          <DialogDescription>
            Remove <span className="font-medium text-foreground">{domain}</span> from SutazMail?
            This deletes its DNS records and DKIM key. The DNS you published at your registrar is
            not changed.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="domain" value={domain} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
