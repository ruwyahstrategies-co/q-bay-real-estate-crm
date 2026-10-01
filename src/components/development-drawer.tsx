import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui-primitives";
import { DrawerShell } from "@/components/overlay";
import { MapboxPicker } from "@/components/mapbox-picker";
import { GoogleMapsLinkField } from "@/components/google-maps-link-field";
import { HeroImageField } from "@/components/hero-image-field";
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { CountryAreaPlaceFields } from "@/components/location-fields";
import { useOwners } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { useCreateDevelopment, useUpdateDevelopment } from "@/hooks/use-developments";
import type { Development } from "@/lib/db";
import { cn } from "@/lib/utils";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/**
 * Add/Edit Development drawer. Shared by the Developments list and the Development profile
 * page so both "Add Development" and the profile's "Edit" button open the exact same form.
 */
export function DevelopmentDrawer({
  open,
  onOpenChange,
  development,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  development?: Development | null;
}) {
  const create = useCreateDevelopment();
  const update = useUpdateDevelopment();
  const isEdit = !!development?.id;
  const { data: owners = [] } = useOwners();
  const { data: team = [] } = useTeamMembers();

  const [name, setName] = useState(development?.name ?? "");
  const [developer, setDeveloper] = useState(development?.developer ?? "");
  const [countryId, setCountryId] = useState(development?.country_id ?? "");
  const [areaId, setAreaId] = useState(development?.area_id ?? "");
  const [placeId, setPlaceId] = useState(development?.place_id ?? "");
  const [ownerId, setOwnerId] = useState(development?.owner_id ?? "");
  const [agentId, setAgentId] = useState(development?.assigned_agent_id ?? "");
  const [priceFrom, setPriceFrom] = useState(development?.price_from?.toString() ?? "");
  const [priceTo, setPriceTo] = useState(development?.price_to?.toString() ?? "");
  const [currency, setCurrency] = useState(development?.currency ?? "QAR");
  const [status, setStatus] = useState(development?.status ?? "off_plan");
  const [heroImage, setHeroImage] = useState(development?.hero_image_url ?? "");
  const [heroVideo, setHeroVideo] = useState(development?.hero_video_url ?? "");
  const [tour360, setTour360] = useState(development?.tour_360_url ?? "");
  const [description, setDescription] = useState(development?.description ?? "");
  const [latitude, setLatitude] = useState<number | null>(development?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(development?.longitude ?? null);

  useEffect(() => {
    if (!open) return;
    setName(development?.name ?? "");
    setDeveloper(development?.developer ?? "");
    setCountryId(development?.country_id ?? "");
    setAreaId(development?.area_id ?? "");
    setPlaceId(development?.place_id ?? "");
    setOwnerId(development?.owner_id ?? "");
    setAgentId(development?.assigned_agent_id ?? "");
    setPriceFrom(development?.price_from?.toString() ?? "");
    setPriceTo(development?.price_to?.toString() ?? "");
    setCurrency(development?.currency ?? "QAR");
    setStatus(development?.status ?? "off_plan");
    setHeroImage(development?.hero_image_url ?? "");
    setHeroVideo(development?.hero_video_url ?? "");
    setTour360(development?.tour_360_url ?? "");
    setDescription(development?.description ?? "");
    setLatitude(development?.latitude ?? null);
    setLongitude(development?.longitude ?? null);
  }, [open, development?.id]);

  const pending = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    const payload = {
      name: name.trim(),
      slug: development?.slug || slugify(name),
      developer: developer || null,
      country_id: countryId || null,
      area_id: areaId || null,
      place_id: placeId || null,
      owner_id: ownerId || null,
      assigned_agent_id: agentId || null,
      price_from: priceFrom ? Number(priceFrom) : null,
      price_to: priceTo ? Number(priceTo) : null,
      currency,
      status,
      hero_image_url: heroImage || null,
      hero_video_url: heroVideo || null,
      tour_360_url: tour360 || null,
      description: description || null,
      latitude,
      longitude,
    };
    try {
      if (isEdit && development) {
        await update.mutateAsync({ id: development.id, patch: payload });
        toast.success("Development updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Development created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit development" : "Add development"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Development" : "Add Development"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name *</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Developer</span>
          <input className={inputCls} value={developer ?? ""} onChange={(e) => setDeveloper(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owner</span>
          <SearchableSelectField value={ownerId} onChange={(v) => setOwnerId(v ?? "")} options={owners.map((o) => ({ value: o.id, label: o.name }))} placeholder="Select owner" searchPlaceholder="Search owners..." />
        </label>
        <CountryAreaPlaceFields
          value={{ countryId: countryId || null, areaId: areaId || null, placeId: placeId || null }}
          onChange={(l) => { setCountryId(l.countryId ?? ""); setAreaId(l.areaId ?? ""); setPlaceId(l.placeId ?? ""); }}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned agent</span>
          <SearchableSelectField value={agentId} onChange={(v) => setAgentId(v ?? "")} options={team.map((m) => ({ value: m.id, label: m.full_name }))} placeholder="Select agent" searchPlaceholder="Search agents..." />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
          <SelectField
            value={status ?? "off_plan"}
            onChange={(v) => setStatus(v ?? "off_plan")}
            options={[
              { value: "off_plan", label: "Off-plan" },
              { value: "under_construction", label: "Under construction" },
              { value: "ready", label: "Ready" },
            ]}
            allowClear={false}
          />
        </label>

        {/* Price From and Price To must always land on the same row, whatever comes before them
            (the location fields above render 1-3 cells and can shift the parent grid's parity).
            A small dedicated sub-grid keeps this pair aligned regardless. */}
        <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Price from</span>
            <input className={inputCls} type="number" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Price to</span>
            <input className={inputCls} type="number" value={priceTo} onChange={(e) => setPriceTo(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Currency</span>
            <SelectField
              value={currency ?? "QAR"}
              onChange={(v) => setCurrency(v ?? "QAR")}
              options={["QAR", "AED", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }))}
              allowClear={false}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hero image</span>
          <HeroImageField value={heroImage} onChange={(url) => setHeroImage(url ?? "")} categoryKey="development_media" label="hero image" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hero video URL</span>
          <input className={inputCls} value={heroVideo ?? ""} onChange={(e) => setHeroVideo(e.target.value)} placeholder="https://..." />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">360 tour URL</span>
          <input className={inputCls} value={tour360 ?? ""} onChange={(e) => setTour360(e.target.value)} placeholder="https://..." />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Description</span>
          <textarea className={cn(inputCls, "h-24 py-2")} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Latitude</span>
          <input className={inputCls} type="number" step="any" value={latitude ?? ""} onChange={(e) => setLatitude(e.target.value ? Number(e.target.value) : null)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Longitude</span>
          <input className={inputCls} type="number" step="any" value={longitude ?? ""} onChange={(e) => setLongitude(e.target.value ? Number(e.target.value) : null)} />
        </label>
        <div className="sm:col-span-2">
          <GoogleMapsLinkField onResolved={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} />
        </div>
        <div className="sm:col-span-2">
          <MapboxPicker
            latitude={latitude}
            longitude={longitude}
            onChange={(lat, lng) => { setLatitude(lat); setLongitude(lng); }}
            className="h-56"
          />
        </div>
        <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4 mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : isEdit ? "Save changes" : "Save Development"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}
