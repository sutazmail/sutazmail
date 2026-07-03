"use client";

import { useActionState, useState } from "react";
import { setAutoresponderAction, type RulesState } from "../actions";
import type { Autoresponder } from "@/server/sieve-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: RulesState = {};

export function AutoresponderForm({ initial }: { initial: Autoresponder }) {
  const [state, formAction, pending] = useActionState(setAutoresponderAction, initialState);
  const [enabled, setEnabled] = useState(initial.enabled);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Auto-responder saved.</p>
      ) : null}

      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          name="ar_enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-4 accent-primary"
        />
        <span className="text-sm font-medium">Turn on auto-responder</span>
      </label>

      <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-50">
        <div className="space-y-2">
          <Label htmlFor="ar_subject">Subject</Label>
          <Input id="ar_subject" name="ar_subject" defaultValue={initial.subject} placeholder="Out of office" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ar_message">Message</Label>
          <Textarea
            id="ar_message"
            name="ar_message"
            defaultValue={initial.message}
            placeholder="I'm away until Monday and will reply when I'm back."
            maxLength={4000}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ar_days">Reply to each sender at most once every</Label>
          <div className="flex items-center gap-2">
            <Input
              id="ar_days"
              name="ar_days"
              type="number"
              min={1}
              max={365}
              defaultValue={initial.days}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save auto-responder"}
      </Button>
    </form>
  );
}
