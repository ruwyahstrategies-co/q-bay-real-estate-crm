import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Building, Trash2, Pencil, X, Globe, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionGate } from "@/components/permission-gate";
import { DrawerShell } from "@/components/overlay";
import { MapboxPicker } from "@/components/mapbox-picker";
import { HeroImageField } from "@/components/hero-image-field";
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { usePermissions } from "@/hooks/use-auth";
import { useCountries, useAreas } from "@/hooks/use-locations";
import { useOwners } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import {
  useDevelopments,
  useCreateDevelopment,
  useUpdateDevelopment,
  useDeleteDevelopment,
} from "@/hooks/use-developments";
import type { Development } from "@/lib/db";
import { fmtMoney } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/developments")({
  head: () => ({ meta: [{ title: "Developments" }] }),
  component: DevelopmentsPage,
});

const inputCls = "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function DevelopmentsPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Development | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Development | null>(null);
  const { data: developments = [] } = useDevelopments({ search });
  const del = useDeleteDevelopment();
  const update = useUpdateDevelopment();
  const { can } = usePermissions();
  const canCreate = can("developments", "create");
  const canEdit = can("developments", "edit");
  const canDelete = can("developments", "delete");
  const canPublish = can("developments", "publish") || canEdit;

  return (
    <AppShell>
      <PermissionGate module="developments" action="view" page>
      <PageHeader
        eyebrow="Inventory"
        title="Developments"
        description="Off-plan and completed developments, linked to properties and enquiries."
        actions={canCreate ? <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-3.5 w-3.5" /> Add Development</Button> : undefined}
      />
      <div className="mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search developments..." className={cn(inputCls, "w-full max-w-xs")} />
      </div>
      <DataTable
        columns={["Development", "Developer", "Location", "Price from", "Status", "Published", "Actions"]}
        empty={<EmptyState icon={<Building className="h-4 w-4" />} title="No developments yet" description="Add a development to link properties and track enquiries." />}
      >
        {developments.map((d) => (
          <tr key={d.id} className="border-b border-border last:border-0 hover:bg-background/60">
            <td className="px-4 py-3 text-sm font-medium">
              <Link to="/developments/$developmentId" params={{ developmentId: d.id }} className="hover:underline">{d.name}</Link>
            </td>
            <td className="px-4 py-3 text-xs">{d.developer ?? "-"}</td>
            <td className="px-4 py-3 text-xs">{[d.area_id, d.country_id].filter(Boolean).length ? "-" : "-"}</td>
            <td className="px-4 py-3 text-xs">{fmtMoney(d.price_from, d.currency)}</td>
            <td className="px-4 py-3 text-xs capitalize">{d.status ?? "-"}</td>
            <td className="px-4 py-3 text-xs">
              <button
                disabled={!canPublish}
                onClick={() => update.mutate({ id: d.id, patch: { is_published: !d.is_published } })}
                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", d.is_published ? "bg-pastel-green" : "bg-muted text-muted-foreground")}
              >
                {d.is_published ? <Globe className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {d.is_published ? "Published" : "Draft"}
              </button>
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-1">
                {canEdit && <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => { setEdit(d); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></button>}
                {canDelete && <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={() => setConfirmDelete(d)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <DevelopmentDrawer open={open} onOpenChange={setOpen} development={edit} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete development?"
        description={`Delete ${confirmDelete?.name}? Linked properties keep their record but lose the development link.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Development deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

function DevelopmentDrawer({ open, onOpenChange, development }: { open: boolean; onOpenChange: (v: boolean) => void; development?: Development | null }) {
  const create = useCreateDevelopment();
  const update = useUpdateDevelopment();
  const isEdit = !!development?.id;
  const { data: countries = [] } = useCountries();
  const { data: owners = [] } = useOwners();
  const { data: team = [] } = useTeamMembers();

  const [name, setName] = useState(development?.name ?? "");
  const [developer, setDeveloper] = useState(development?.developer ?? "");
  const [countryId, setCountryId] = useState(development?.country_id ?? "");
  const { data: areas = [] } = useAreas(countryId || undefined);
  const [areaId, setAreaId] = useState(development?.area_id ?? "");
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
      if (isEdit && development) { await update.mutateAsync({ id: development.id, patch: payload }); toast.success("Development updated"); }
      else { await create.mutateAsync(payload); toast.success("Development created"); }
      onOpenChange(false);
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit development" : "Add development"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Development" : "Add Development"}</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
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
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Country</span>
          <SelectField value={countryId} onChange={(v) => { setCountryId(v ?? ""); setAreaId(""); }} options={countries.map((c) => ({ value: c.id, label: c.name }))} placeholder="Select country" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Area</span>
          <SelectField value={areaId} onChange={(v) => setAreaId(v ?? "")} options={areas.map((a) => ({ value: a.id, label: a.name }))} placeholder="Select area" disabled={!countryId} />
        </label>
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
