import { Button } from "./ui-primitives";
import { DialogShell } from "./overlay";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
  onCancel,
  pending,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  return (
    <DialogShell open={open} onOpenChange={(v) => { if (!v) onCancel(); }} ariaLabel={title}>
      <div className="p-5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={pending}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
