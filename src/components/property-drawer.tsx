import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { cn } from "@/lib/utils";
import { useCreateProperty, useUpdateProperty } from "@/hooks/use-properties";
import type { Property } from "@/lib/db";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function PropertyDrawer({
  open,
  onOpenChange,
  property,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  property?: Property | null;
  onSaved?: (property: Property, wasNew: boolean) => void;
}) {
  const create = useCreateProperty();
  const update = useUpdateProperty();
  const isEdit = !!property?.id;

  const [form, setForm] = useState<Partial<Property> & { amenities_str?: string }>(() => ({
    title: property?.title ?? "",
    reference_code: property?.reference_code ?? "",
    property_type: property?.property_type ?? "Apartment",
    location: property?.location ?? "",
    developer: property?.developer ?? "",
    price: property?.price ?? null,
    currency: property?.currency ?? "QAR",
    bedrooms: property?.bedrooms ?? null,
    bathrooms: property?.bathrooms ?? null,
    size: property?.size ?? null,
    size_unit: property?.size_unit ?? "sqm",
    completion_status: property?.completion_status ?? "",
    availability: property?.availability ?? "available",
    description: property?.description ?? "",
    amenities_str: (property?.amenities ?? []).join(", "),
  }));

  if (!open) return null;

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const title = (form.title ?? "").trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    const amenities = (form.amenities_str ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      title,
      reference_code: form.reference_code || null,
      property_type: form.property_type || null,
      location: form.location || null,
      developer: form.developer || null,
      price: form.price ? Number(form.price) : null,
      currency: form.currency || "QAR",
      bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
      size: form.size ? Number(form.size) : null,
      size_unit: form.size_unit || null,
      completion_status: form.completion_status || null,
      availability: form.availability || "available",
      description: form.description || null,
      amenities: amenities.length ? amenities : null,
    };
    try {
      if (isEdit && property) {
        const saved = await update.mutateAsync({ id: property.id, patch: payload });
        toast.success("Property updated");
        onSaved?.(saved, false);
      } else {
        const saved = await create.mutateAsync(payload);
        toast.success("Property created");
        onSaved?.(saved, true);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30">
      <div className="flex w-full max-w-md flex-col bg-canvas shadow-2xl" role="dialog" aria-label={isEdit ? "Edit property" : "Add property"}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{isEdit ? "Edit Property" : "Add Property"}</h3>
          <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2" onSubmit={handleSubmit}>
          <Field label="Title *" full>
            <input className={inputCls} value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} required />
          </Field>
          <Field label="Reference code">
            <input className={inputCls} value={form.reference_code ?? ""} onChange={(e) => set("reference_code", e.target.value)} />
          </Field>
          <Field label="Property type">
            <select className={inputCls} value={form.property_type ?? ""} onChange={(e) => set("property_type", e.target.value)}>
              <option>Apartment</option>
              <option>Villa</option>
              <option>Townhouse</option>
              <option>Penthouse</option>
              <option>Plot</option>
              <option>Commercial</option>
            </select>
          </Field>
          <Field label="Location">
            <input className={inputCls} value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label="Developer">
            <input className={inputCls} value={form.developer ?? ""} onChange={(e) => set("developer", e.target.value)} />
          </Field>
          <Field label="Price">
            <input className={inputCls} type="number" value={form.price ?? ""} onChange={(e) => set("price", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={form.currency ?? "QAR"} onChange={(e) => set("currency", e.target.value)}>
              <option>QAR</option>
              <option>AED</option>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </Field>
          <Field label="Bedrooms">
            <input className={inputCls} type="number" value={form.bedrooms ?? ""} onChange={(e) => set("bedrooms", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Bathrooms">
            <input className={inputCls} type="number" step="0.5" value={form.bathrooms ?? ""} onChange={(e) => set("bathrooms", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Size">
            <input className={inputCls} type="number" value={form.size ?? ""} onChange={(e) => set("size", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label="Size unit">
            <select className={inputCls} value={form.size_unit ?? "sqm"} onChange={(e) => set("size_unit", e.target.value)}>
              <option value="sqm">sqm</option>
              <option value="sqft">sqft</option>
            </select>
          </Field>
          <Field label="Completion status">
            <select className={inputCls} value={form.completion_status ?? ""} onChange={(e) => set("completion_status", e.target.value)}>
              <option value="">—</option>
              <option>Ready</option>
              <option>Off-plan</option>
              <option>Under construction</option>
            </select>
          </Field>
          <Field label="Availability">
            <select className={inputCls} value={form.availability ?? "available"} onChange={(e) => set("availability", e.target.value)}>
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
              <option value="off_market">Off market</option>
            </select>
          </Field>
          <Field label="Amenities (comma separated)" full>
            <input className={inputCls} value={form.amenities_str ?? ""} onChange={(e) => set("amenities_str", e.target.value)} />
          </Field>
          <Field label="Description" full>
            <textarea className={cn(inputCls, "h-24 py-2")} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </Field>

          <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Save Property"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
