"use client";

import { useActionState, useState } from "react";
import { setForwardingAction, type RulesState } from "../actions";
import type { Forwarding } from "@/server/sieve-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: RulesState = {};

export function ForwardingForm({ initial }: { initial: Forwarding }) {
  const [state, formAction, pending] = useActionState(setForwardingAction, initialState);
  const [enabled, setEnabled] = useState(initial.enabled);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Forwarding saved.</p>
      ) : null}

      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          name="fwd_enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4 accent-primary"
        />
        <span className="text-sm font-medium">Forward my incoming mail</span>
      </label>

      <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-50">
        <div className="space-y-2">
          <Label htmlFor="fwd_to">Forward to</Label>
          <Input
            id="fwd_to"
            name="fwd_to"
            type="email"
            defaultValue={initial.to}
            placeholder="other@example.com"
          />
        </div>
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            name="fwd_keepCopy"
            defaultChecked={initial.keepCopy}
            className="size-4 accent-primary"
          />
          <span className="text-sm">Also keep a copy in this mailbox</span>
        </label>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save forwarding"}
      </Button>
    </form>
  );
}
