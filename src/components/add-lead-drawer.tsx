import { X } from "lucide-react";
import { Button } from "./ui-primitives";
import { cn } from "@/lib/utils";

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function AddLeadDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30">
      <div
        className="flex w-full max-w-md flex-col bg-canvas shadow-2xl"
        role="dialog"
        aria-label="Add lead"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Add Lead</h3>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2"
          onSubmit={(e) => e.preventDefault()}
        >
          <Field label="Full name" full>
            <input className={inputCls} placeholder="Jane Doe" />
          </Field>
          <Field label="Phone number">
            <input className={inputCls} placeholder="+971…" />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" placeholder="jane@…" />
          </Field>
          <Field label="Nationality (optional)">
            <input className={inputCls} />
          </Field>
          <Field label="Preferred language">
            <input className={inputCls} placeholder="English" />
          </Field>
          <Field label="Budget min">
            <input className={inputCls} type="number" />
          </Field>
          <Field label="Budget max">
            <input className={inputCls} type="number" />
          </Field>
          <Field label="Currency">
            <select className={inputCls}>
              <option>AED</option>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </Field>
          <Field label="Property type">
            <select className={inputCls}>
              <option>Apartment</option>
              <option>Villa</option>
              <option>Townhouse</option>
              <option>Penthouse</option>
              <option>Plot</option>
              <option>Commercial</option>
            </select>
          </Field>
          <Field label="Preferred locations" full>
            <input className={inputCls} placeholder="Comma separated" />
          </Field>
          <Field label="Bedrooms">
            <input className={inputCls} placeholder="Any" />
          </Field>
          <Field label="Purchase purpose">
            <select className={inputCls}>
              <option>Primary residence</option>
              <option>Investment</option>
              <option>Holiday home</option>
            </select>
          </Field>
          <Field label="Buying timeline">
            <select className={inputCls}>
              <option>Immediate</option>
              <option>1–3 months</option>
              <option>3–6 months</option>
              <option>6–12 months</option>
              <option>Exploring</option>
            </select>
          </Field>
          <Field label="Financing status">
            <select className={inputCls}>
              <option>Cash</option>
              <option>Mortgage approved</option>
              <option>Mortgage pending</option>
              <option>Undecided</option>
            </select>
          </Field>
          <Field label="Lead source">
            <input className={inputCls} placeholder="Website, referral…" />
          </Field>
          <Field label="Assigned agent">
            <input className={inputCls} placeholder="Unassigned" />
          </Field>
          <Field label="Notes" full>
            <textarea className={cn(inputCls, "h-24 py-2")} />
          </Field>
        </form>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled title="Backend not connected">
            Save Lead
          </Button>
        </div>
      </div>
    </div>
  );
}
