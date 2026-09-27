import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField } from "./select-field";
import { useCreateStaffRequest, useUpdateStaffRequest } from "@/hooks/use-staff-requests";
import {
  REQUEST_CATEGORIES,
  REQUEST_CATEGORY_LABELS,
  REQUEST_PRIORITIES,
  type StaffRequest,
} from "@/lib/db";
import { cn, titleCase } from "@/lib/utils";

const inputCls =
  "rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

/** Send a new request, or edit one of your own while it is still Submitted. */
export function RequestDrawer({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request?: StaffRequest | null;
}) {
  const isEdit = !!request;
  const create = useCreateStaffRequest();
  const update = useUpdateStaffRequest();
  const [category, setCategory] = useState("general");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");

  useEffect(() => {
    if (!open) return;
    setCategory(request?.category ?? "general");
    setTitle(request?.title ?? "");
    setDescription(request?.description ?? "");
    setPriority(request?.priority ?? "normal");
  }, [open, request]);

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3)
      return toast.error("Give the request a short title (at least 3 characters)");
    const fields = {
      title: cleanTitle,
      description: description.trim() || null,
      category,
      priority,
    };
    try {
      if (request) {
        await update.mutateAsync({ id: request.id, patch: fields });
        toast.success("Request updated");
      } else {
        await create.mutateAsync(fields);
        toast.success("Request sent");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel={isEdit ? "Edit request" : "New request"}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Request" : "New Request"}</h3>
        <button
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="flex-1 space-y-3 overflow-y-auto p-5" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Category
          </span>
          <SelectField
            value={category}
            onChange={(v) => setCategory(v ?? "general")}
            options={REQUEST_CATEGORIES.map((c) => ({
              value: c,
              label: REQUEST_CATEGORY_LABELS[c],
            }))}
            allowClear={false}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Title *
          </span>
          <input
            className={cn(inputCls, "h-9")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What do you need?"
            maxLength={200}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Details
          </span>
          <textarea
            className={cn(inputCls, "h-32 py-2")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Give management what they need to act on it: what, which property or lead, and by when."
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Priority
          </span>
          <SelectField
            value={priority}
            onChange={(v) => setPriority(v ?? "normal")}
            options={REQUEST_PRIORITIES.map((p) => ({ value: p, label: titleCase(p) }))}
            allowClear={false}
          />
        </label>
        <p className="text-[11px] text-muted-foreground">
          Only you and management can see this request. You can edit or withdraw it until someone
          picks it up.
        </p>
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : isEdit ? "Save changes" : "Send request"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}
