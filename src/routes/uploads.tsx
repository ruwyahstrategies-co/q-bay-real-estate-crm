import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Inbox, Trash2, Download, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { UploadDropzone } from "@/components/upload-dropzone";
import { LeadImporter } from "@/components/lead-importer";
import { Card, Button } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { useUploads, useDeleteUpload, downloadUpload } from "@/hooks/use-uploads";
import { useLeads } from "@/hooks/use-leads";
import { useProperties } from "@/hooks/use-properties";
import { fmtDate, fmtSize, UPLOAD_CATEGORIES, type UploadCategoryKey } from "@/lib/db";
import { AccessDenied } from "@/components/permission-gate";
import { usePermissions } from "@/hooks/use-auth";
import { APP_CONFIG } from "@/lib/config";

export const Route = createFileRoute("/uploads")({
  head: () => ({ meta: [{ title: "Uploads" }] }),
  component: UploadsPage,
});

const categoryItems: { key: UploadCategoryKey; description: string }[] = [
  { key: "lead_imports", description: "Import buyer contacts and lead lists." },
  { key: "whatsapp_exports", description: "Conversation history for context." },
  { key: "property_documents", description: "Listings, specs and supporting docs." },
  { key: "property_media", description: "Photos, renders and visuals." },
  { key: "call_recordings", description: "Voice recordings for review." },
  { key: "brochures", description: "Sales collateral and plans." },
  { key: "general_documents", description: "Contracts, offers, notes." },
];

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function UploadsPage() {
  const [leadId, setLeadId] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string>("");
  const [importerOpen, setImporterOpen] = useState(false);
  const { data: leads = [] } = useLeads({ status: "all" });
  const { data: properties = [] } = useProperties({ status: "all" });
  const { data: uploads = [] } = useUploads();
  const deleteUpload = useDeleteUpload();
  const { can } = usePermissions();
  const canUpload = can("uploads", "upload");
  const canDelete = can("uploads", "delete");

  if (!can("uploads", "view")) return <AppShell><AccessDenied /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Data"
        title="Upload Centre"
        description="Files are uploaded directly and stored securely in the cloud."
        actions={
          canUpload ? (
            <Button size="sm" onClick={() => setImporterOpen(true)}>
              <UploadIcon className="h-3.5 w-3.5" /> Import leads
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Associate with lead</span>
            <select className={inputCls} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">None</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>{l.full_name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Associate with property</span>
            <select className={inputCls} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">None</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {canUpload && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categoryItems.map((c) => (
            <UploadDropzone
              key={c.key}
              title={UPLOAD_CATEGORIES[c.key].title}
              description={c.description}
              categoryKey={c.key}
              leadId={leadId || null}
              propertyId={propertyId || null}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        <h3 className="mb-3 text-[16px] font-semibold">Recent uploads</h3>
        <DataTable
          columns={["File", "Category", "Size", "Status", "Uploaded", "Actions"]}
          empty={
            <EmptyState compact icon={<Inbox className="h-4 w-4" />} title="No uploads yet" description="Files you upload will be listed here with their processing status." />
          }
        >
          {uploads.length > 0
            ? uploads.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-background/60">
                  <td className="px-4 py-3 text-sm">{u.filename}</td>
                  <td className="px-4 py-3 text-xs">{u.category}</td>
                  <td className="px-4 py-3 text-xs">{fmtSize(u.file_size)}</td>
                  <td className="px-4 py-3 text-xs capitalize">{u.processing_status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button className="rounded-md p-1.5 hover:bg-muted" title="Download" onClick={() => downloadUpload(u).catch((e) => toast.error((e as Error).message))}>
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {canDelete && (
                        <button
                          className="rounded-md p-1.5 hover:bg-muted text-destructive"
                          title="Delete"
                          onClick={async () => {
                            try { await deleteUpload.mutateAsync(u); toast.success("Deleted"); }
                            catch (e) { toast.error((e as Error).message); }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            : null}
        </DataTable>
      </div>

      <LeadImporter open={importerOpen} onOpenChange={setImporterOpen} />
    </AppShell>
  );
}
