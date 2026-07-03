"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteAliasAction, type ActionResult } from "@/app/actions";
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

export function DeleteAliasButton({ source, recipient }: { source: string; recipient: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    deleteAliasAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Alias deleted");
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
          <DialogTitle>Delete alias</DialogTitle>
          <DialogDescription>
            Delete alias{" "}
            <span className="font-medium text-foreground">
              {source} → {recipient}
            </span>
            ?
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="recipient" value={recipient} />
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
