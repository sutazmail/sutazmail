"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, PencilIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import {
  addDnsRecordAction,
  deleteDnsRecordAction,
  resetDnsRecordsAction,
  updateDnsRecordAction,
  type ActionResult,
} from "@/app/actions";
import { canonicalType, DNS_RECORD_TYPES, type EditableDnsRecord } from "@/lib/dns";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DnsRecords({
  domain,
  customized,
  records,
}: {
  domain: string;
  customized: boolean;
  records: EditableDnsRecord[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableDnsRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copy(r: EditableDnsRecord) {
    try {
      await navigator.clipboard.writeText(r.value);
      setCopied(r.id);
      toast.success(`${r.type} value copied`);
      setTimeout(() => setCopied((c) => (c === r.id ? null : c)), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  function remove(r: EditableDnsRecord) {
    const fd = new FormData();
    fd.set("domain", domain);
    fd.set("recordId", r.id);
    startTransition(async () => {
      const res = await deleteDnsRecordAction(null, fd);
      if (res.ok) toast.success(`${r.type} record deleted`);
      else toast.error(res.error);
    });
  }

  function reset() {
    const fd = new FormData();
    fd.set("domain", domain);
    startTransition(async () => {
      const res = await resetDnsRecordsAction(null, fd);
      if (res.ok) {
        toast.success("DNS records reset to the global templates");
        setResetOpen(false);
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-2">
      {records.map((r) => (
        <div key={r.id} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-xs">
          <span className="font-medium text-muted-foreground">{r.type}</span>
          <code className="truncate rounded bg-muted px-2 py-1 font-mono" title={`${r.host}  ${r.value}`}>
            <span className="text-muted-foreground">{r.host}</span> {r.value}
          </code>
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" onClick={() => copy(r)} aria-label={`Copy ${r.type}`}>
              {copied === r.id ? <CheckIcon /> : <CopyIcon />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditing(r)}
              aria-label={`Edit ${r.type} record`}
            >
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              onClick={() => remove(r)}
              aria-label={`Delete ${r.type} record`}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      ))}
      {records.length === 0 ? (
        <p className="text-xs text-muted-foreground">No DNS records — add one below.</p>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add record
        </Button>
        {customized ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}>
              <Undo2Icon />
              Reset to defaults
            </Button>
            <Badge variant="outline">Customized</Badge>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Following the global templates — editing makes this domain&apos;s records independent.
          </span>
        )}
      </div>

      {adding ? (
        <RecordDialog domain={domain} record={null} onClose={() => setAdding(false)} />
      ) : null}
      {editing ? (
        <RecordDialog domain={domain} record={editing} onClose={() => setEditing(null)} />
      ) : null}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset DNS records?</DialogTitle>
            <DialogDescription>
              Deletes all custom records for {domain}; it will follow the global templates from
              Settings again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button variant="destructive" disabled={pending} onClick={reset}>
              {pending ? "Resetting…" : "Reset to defaults"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Shared add/edit dialog; `record === null` means add. */
function RecordDialog({
  domain,
  record,
  onClose,
}: {
  domain: string;
  record: EditableDnsRecord | null;
  onClose: () => void;
}) {
  const action = record ? updateDnsRecordAction : addDnsRecordAction;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const [type, setType] = useState(() => {
    const t = record ? canonicalType(record.type) : "TXT";
    return (DNS_RECORD_TYPES as readonly string[]).includes(t) ? t : "TXT";
  });

  useEffect(() => {
    if (state?.ok) {
      toast.success(record ? "Record updated" : "Record added");
      onClose();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{record ? "Edit DNS record" : "Add DNS record"}</DialogTitle>
          <DialogDescription>
            {record
              ? `Change what ${domain} publishes for this record.`
              : `Add a record to publish for ${domain}.`}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="domain" value={domain} />
          {record ? <input type="hidden" name="recordId" value={record.id} /> : null}
          <input type="hidden" name="type" value={type} />
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(String(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DNS_RECORD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dns-host">Host</Label>
            <Input
              id="dns-host"
              name="host"
              defaultValue={record?.host ?? `${domain}.`}
              placeholder={`${domain}.`}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dns-value">Value</Label>
            <Input
              id="dns-value"
              name="value"
              defaultValue={record?.value ?? ""}
              placeholder="e.g. 10 mail.example.com."
              required
            />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : record ? "Save record" : "Add record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
