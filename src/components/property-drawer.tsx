import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { MapboxPicker } from "./mapbox-picker";
import { GoogleMapsLinkField } from "./google-maps-link-field";
import { HeroImageField } from "./hero-image-field";
import { SelectField, SearchableSelectField } from "./select-field";
import { cn } from "@/lib/utils";
import { useCreateProperty, useUpdateProperty, usePropertyReferencePreview } from "@/hooks/use-properties";
import { useCountries, useAreas } from "@/hooks/use-locations";
import { useDevelopments } from "@/hooks/use-developments";
import { useOwners } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { PROPERTY_PURPOSES, PROPERTY_PURPOSE_LABELS, type Property } from "@/lib/db";

const PROPERTY_TYPE_OPTIONS = ["Apartment", "Villa", "Townhouse", "Penthouse", "Plot", "Commercial"].map((v) => ({ value: v, label: v }));
const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "off_market", label: "Off market" },
];
const CURRENCY_OPTIONS = ["QAR", "AED", "USD", "EUR", "GBP"].map((v) => ({ value: v, label: v }));
const SIZE_UNIT_OPTIONS = [
  { value: "sqm", label: "sqm" },
  { value: "sqft", label: "sqft" },
];
const COMPLETION_STATUS_OPTIONS = ["Ready", "Off-plan", "Under construction"].map((v) => ({ value: v, label: v }));

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

type FormState = Partial<Property> & { amenities_str?: string };

function initialForm(property: Property | null | undefined): FormState {
  return {
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
    purpose: property?.purpose ?? "sale",
    country_id: property?.country_id ?? null,
    area_id: property?.area_id ?? null,
    development_id: property?.development_id ?? null,
    owner_id: property?.owner_id ?? null,
    assigned_agent_id: property?.assigned_agent_id ?? null,
    hero_image_url: property?.hero_image_url ?? "",
    hero_video_url: property?.hero_video_url ?? "",
    tour_360_url: property?.tour_360_url ?? "",
    latitude: property?.latitude ?? null,
    longitude: property?.longitude ?? null,
    seo_title: property?.seo_title ?? "",
    seo_description: property?.seo_description ?? "",
    is_published: property?.is_published ?? false,
  };
}

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
  const { data: countries = [] } = useCountries();
  const { data: developments = [] } = useDevelopments();
  const { data: owners = [] } = useOwners();
  const { data: team = [] } = useTeamMembers();

  const [form, setForm] = useState<FormState>(() => initialForm(property));
  const { data: areas = [] } = useAreas(form.country_id || undefined);
  const { data: referencePreview } = usePropertyReferencePreview(form.owner_id, form.assigned_agent_id);

  const selectedDevelopment = developments.find((d) => d.id === form.development_id) ?? null;
  const developerOwnerId = selectedDevelopment?.owner_id ?? null;
  const ownerOptions = owners.map((o) => ({
    value: o.id,
    label: o.id === developerOwnerId || o.is_developer ? `Developer: ${o.name}` : o.name,
  }));

  // The drawer shell stays mounted through its close animation, so reset the
  // form explicitly whenever a different record (or a fresh "add") opens.
  useEffect(() => {
    if (open) setForm(initialForm(property));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, property?.id]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
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
      purpose: form.purpose || "sale",
      country_id: form.country_id || null,
      area_id: form.area_id || null,
      development_id: form.development_id || null,
      owner_id: form.owner_id || null,
      assigned_agent_id: form.assigned_agent_id || null,
      hero_image_url: form.hero_image_url || null,
      hero_video_url: form.hero_video_url || null,
      tour_360_url: form.tour_360_url || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      is_published: !!form.is_published,
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

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit property" : "Add property"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Property" : "Add Property"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start" onSubmit={handleSubmit}>
        <Field label="Title *" full>
          <input className={inputCls} value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} required />
        </Field>
        <Field label="Reference code">
          <div className={cn(inputCls, "flex items-center text-muted-foreground")}>
            {form.reference_code
              ? form.reference_code
              : referencePreview
                ? <span title="Provisional - the final code is reserved when you save">{referencePreview} (preview)</span>
                : "Select an owner and agent to generate"}
          </div>
        </Field>
        <Field label="Location">
          <input className={inputCls} value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Property type">
          <SelectField value={form.property_type} onChange={(v) => set("property_type", v ?? "")} options={PROPERTY_TYPE_OPTIONS} allowClear={false} placeholder="Select type" />
        </Field>
        <Field label="Price">
          <input className={inputCls} type="number" value={form.price ?? ""} onChange={(e) => set("price", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Bedrooms">
          <input className={inputCls} type="number" value={form.bedrooms ?? ""} onChange={(e) => set("bedrooms", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Availability">
          <SelectField value={form.availability ?? "available"} onChange={(v) => set("availability", v ?? "available")} options={AVAILABILITY_OPTIONS} allowClear={false} />
        </Field>
        <Field label="Currency">
          <SelectField value={form.currency ?? "QAR"} onChange={(v) => set("currency", v ?? "QAR")} options={CURRENCY_OPTIONS} allowClear={false} />
        </Field>

        <div className="sm:col-span-2 mt-1 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Classification & location</p>
        </div>
        <Field label="Purpose">
          <SelectField
            value={form.purpose ?? "sale"}
            onChange={(v) => set("purpose", (v ?? "sale") as FormState["purpose"])}
            options={PROPERTY_PURPOSES.map((p) => ({ value: p, label: PROPERTY_PURPOSE_LABELS[p] ?? p }))}
            allowClear={false}
          />
        </Field>
        <Field label="Country">
          <SelectField
            value={form.country_id}
            onChange={(v) => { set("country_id", v); set("area_id", null); }}
            options={countries.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Select country"
          />
        </Field>
        <Field label="Area">
          <SelectField
            value={form.area_id}
            onChange={(v) => set("area_id", v)}
            options={areas.map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Select area"
            disabled={!form.country_id}
          />
        </Field>
        <Field label="Development">
          <SearchableSelectField
            value={form.development_id}
            onChange={(v) => {
              set("development_id", v);
              const dev = developments.find((d) => d.id === v);
              // Auto-suggest the development's developer as owner, but never
              // clobber an owner the user already picked.
              if (dev?.owner_id && !form.owner_id) set("owner_id", dev.owner_id);
            }}
            options={developments.map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Select development"
            searchPlaceholder="Search developments..."
          />
        </Field>
        <Field label="Owner">
          <SearchableSelectField
            value={form.owner_id}
            onChange={(v) => set("owner_id", v)}
            options={ownerOptions}
            placeholder="Select owner"
            searchPlaceholder="Search owners..."
          />
        </Field>
        <Field label="Assigned agent">
          <SearchableSelectField
            value={form.assigned_agent_id}
            onChange={(v) => set("assigned_agent_id", v)}
            options={team.map((m) => ({ value: m.id, label: m.full_name }))}
            placeholder="Select agent"
            searchPlaceholder="Search agents..."
          />
        </Field>
        <Field label="Latitude">
          <input className={inputCls} type="number" step="any" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Longitude">
          <input className={inputCls} type="number" step="any" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <div className="sm:col-span-2">
          <GoogleMapsLinkField onResolved={(lat, lng) => { set("latitude", lat); set("longitude", lng); }} />
        </div>
        <div className="sm:col-span-2">
          <MapboxPicker
            latitude={form.latitude ?? null}
            longitude={form.longitude ?? null}
            onChange={(lat, lng) => { set("latitude", lat); set("longitude", lng); }}
            className="h-56"
          />
        </div>

        <div className="sm:col-span-2 mt-1 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Website & publishing</p>
        </div>
        <Field label="Hero image" full>
          <HeroImageField
            value={form.hero_image_url}
            onChange={(url) => set("hero_image_url", url ?? "")}
            categoryKey="property_media"
            propertyId={property?.id}
            label="hero image"
          />
        </Field>
        <Field label="Hero video URL">
          <input className={inputCls} value={form.hero_video_url ?? ""} onChange={(e) => set("hero_video_url", e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="360 tour URL">
          <input className={inputCls} value={form.tour_360_url ?? ""} onChange={(e) => set("tour_360_url", e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="SEO title">
          <input className={inputCls} value={form.seo_title ?? ""} onChange={(e) => set("seo_title", e.target.value)} />
        </Field>
        <Field label="SEO description">
          <input className={inputCls} value={form.seo_description ?? ""} onChange={(e) => set("seo_description", e.target.value)} />
        </Field>
        <Field label="Website publication" full>
          <label className="flex h-9 items-center gap-2 text-xs">
            <input type="checkbox" checked={!!form.is_published} onChange={(e) => set("is_published", e.target.checked)} />
            Publish this listing to the future public website
          </label>
        </Field>

        <div className="sm:col-span-2 mt-1 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">More details</p>
        </div>
        <Field label="Bathrooms">
          <input className={inputCls} type="number" step="0.5" value={form.bathrooms ?? ""} onChange={(e) => set("bathrooms", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Size">
          <input className={inputCls} type="number" value={form.size ?? ""} onChange={(e) => set("size", e.target.value ? Number(e.target.value) : null)} />
        </Field>
        <Field label="Size unit">
          <SelectField value={form.size_unit ?? "sqm"} onChange={(v) => set("size_unit", v ?? "sqm")} options={SIZE_UNIT_OPTIONS} allowClear={false} />
        </Field>
        <Field label="Completion status">
          <SelectField value={form.completion_status} onChange={(v) => set("completion_status", v ?? "")} options={COMPLETION_STATUS_OPTIONS} placeholder="Select status" />
        </Field>
        <Field label="Developer" full>
          <input className={inputCls} value={form.developer ?? ""} onChange={(e) => set("developer", e.target.value)} />
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
            {pending ? "Saving..." : isEdit ? "Save changes" : "Save Property"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}
