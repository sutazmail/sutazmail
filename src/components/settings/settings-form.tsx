"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveSettingsAction, type ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SettingsField {
  name: string;
  label: string;
  value: string;
  hint?: string;
}

export function SettingsForm({ groups }: { groups: { title: string; fields: SettingsField[] }[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveSettingsAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) toast.success("Settings saved");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-6">
      {groups.map((g) => (
        <div key={g.title} className="rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">{g.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input id={f.name} name={f.name} defaultValue={f.value} required />
                {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
