"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DkimRecord({ record }: { record: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(record);
      setCopied(true);
      toast.success("DKIM record copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="flex items-start gap-2">
      <pre className="flex-1 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
        {record}
      </pre>
      <Button variant="outline" size="icon-sm" onClick={copy} aria-label="Copy DKIM record">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}
