"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { addDomainAction, type ActionResult } from "@/app/actions";
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

export function AddDomainDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    addDomainAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Domain added — publish the DNS records shown below");
      setOpen(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Add domain
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add domain</DialogTitle>
          <DialogDescription>
            Registers the domain, generates its DKIM key, and shows the DNS to publish.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-domain">Domain</Label>
            <Input id="add-domain" name="domain" placeholder="example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-domain-org">Organization (optional)</Label>
            <Input id="add-domain-org" name="org" placeholder="Defaults to the domain name" />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
