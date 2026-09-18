import { X, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { EmptyState } from "./empty-state";
import { DrawerShell } from "./overlay";
import { UploadDropzone } from "./upload-dropzone";
import { downloadUpload, useUploads, useDeleteUpload } from "@/hooks/use-uploads";
import { usePermissions } from "@/hooks/use-auth";
import type { Offer } from "@/hooks/use-offers";

export function OfferAttachmentsDrawer({
  open,
  onOpenChange,
  offer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offer: Offer & { leads?: { full_name: string } | null };
}) {
  const { can } = usePermissions();
  const canUpload = can("uploads", "upload");
  const canDeleteUpload = can("uploads", "delete");
  const { data: files = [] } = useUploads({ offerId: offer.id });
  const deleteUpload = useDeleteUpload();

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Offer attachments">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">Offer attachments</h3>
          <p className="text-xs text-muted-foreground">{offer.leads?.full_name ?? "Lead"}</p>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {canUpload && (
          <UploadDropzone
            title="Upload offer document"
            description="Signed offer letters, ID copies, supporting PDFs or images."
            categoryKey="offer_attachments"
            offerId={offer.id}
          />
        )}
        {files.length === 0 ? (
          <EmptyState compact title="No attachments yet" />
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                <div className="flex items-center gap-2 text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{f.filename}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadUpload(f).catch((e) => toast.error((e as Error).message))}
                  >
                    Download
                  </Button>
                  {canDeleteUpload && (
                    <button
                      className="rounded-md p-1.5 hover:bg-muted text-destructive"
                      onClick={async () => {
                        try {
                          await deleteUpload.mutateAsync(f);
                          toast.success("Deleted");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                      aria-label="Delete attachment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
