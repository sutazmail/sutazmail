"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { addAliasAction, type ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
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

export function AddAliasDialog() {
  const [open, setOpen] = useState(false);
  const [, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, fd) => {
      const res = await addAliasAction(prev, fd);
      if (res.ok) {
        toast.success("Alias created");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
      return res;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Add alias
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add alias</DialogTitle>
          <DialogDescription>
            Forward mail from a source address (or /regex/) to a recipient.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="alias-source">Source</Label>
            <Input id="alias-source" name="source" type="text" placeholder="sales@example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="alias-recipient">Recipient</Label>
            <Input
              id="alias-recipient"
              name="recipient"
              type="email"
              placeholder="user@example.com"
              required
            />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
