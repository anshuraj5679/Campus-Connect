"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addClusterSection } from "@/lib/actions/routines";

/** Lets the Cluster Head add a section to their cluster before any student has signed up. */
export function AddSectionForm({ clusterName }: { clusterName: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await addClusterSection({ name });
          if (r.ok) {
            toast.success(r.message);
            setName("");
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="new-section">Add a section to {clusterName}</Label>
        <Input id="new-section" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="5J" maxLength={4} className="w-32 uppercase" required />
      </div>
      <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Plus aria-hidden />} Add section
      </Button>
    </form>
  );
}
