import { useRef } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DocumentList } from "./document-list";
import { UploadDropzone } from "./upload-dropzone";
import { usePermissions } from "@/hooks/use-auth";
import { useUpdateTenancy } from "@/hooks/use-property-management";
import {
  UploadValidationError,
  downloadUpload,
  getSignedPreviewUrl,
  useUploadFile,
  useUploads,
} from "@/hooks/use-uploads";
import { UPLOAD_CATEGORIES, fmtDateTime, fmtSize, type PropertyLease } from "@/lib/db";

/**
 * The Rent Contract of one tenancy: the signed tenancy document, kept apart from addenda and
 * other paperwork. It is the file the tenancy's contract_upload_id points to, stored privately
 * with the rest of the tenancy documents. Replacing it keeps the earlier file in the list below,
 * so nothing is lost.
 */
export function RentContractPanel({ lease }: { lease: PropertyLease }) {
  const { can } = usePermissions();
  const canView = can("uploads", "view");
  const canManage = can("properties", "edit") && can("uploads", "upload");
  const { data: documents = [] } = useUploads({ propertyLeaseId: lease.id });
  const upload = useUploadFile();
  const updateTenancy = useUpdateTenancy();
  const input = useRef<HTMLInputElement>(null);

  const contract = documents.find((d) => d.id === lease.contract_upload_id) ?? null;
  const others = documents.filter((d) => d.id !== lease.contract_upload_id);
  const cat = UPLOAD_CATEGORIES.tenant_documents;

  async function attachAsContract(uploadId: string) {
    await updateTenancy.mutateAsync({ id: lease.id, patch: { contract_upload_id: uploadId } });
  }

  async function handleFile(file: File) {
    try {
      const row = await upload.mutateAsync({
        file,
        categoryKey: "tenant_documents",
        propertyLeaseId: lease.id,
      });
      await attachAsContract(row.id);
      toast.success(contract ? "Rent Contract replaced" : "Rent Contract uploaded");
    } catch (e) {
      toast.error(
        e instanceof UploadValidationError
          ? e.message
          : `Rent Contract not saved: ${(e as Error).message}`,
      );
    }
  }

  async function view() {
    if (!contract) return;
    const url = await getSignedPreviewUrl(contract);
    if (!url) {
      toast.error("Could not open the Rent Contract. Try Download instead.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const busy = upload.isPending || updateTenancy.isPending;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-qbay/25 bg-qbay-tint p-4">
        <div className="flex items-start gap-3">
          <FileSignature className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold">Rent Contract</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lease.contract_number ? `Reference ${lease.contract_number}. ` : ""}The signed
              tenancy document. Stored privately and never public.
            </p>

            {contract ? (
              <div className="mt-3 rounded-lg border border-border bg-canvas p-3 text-xs">
                <p className="truncate font-medium">{contract.filename}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {fmtSize(contract.file_size)} · uploaded {fmtDateTime(contract.created_at)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {canView && (
                    <>
                      <Button size="sm" variant="outline" onClick={view}>
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadUpload(contract).catch((e) => toast.error((e as Error).message))
                        }
                      >
                        Download
                      </Button>
                    </>
                  )}
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => input.current?.click()}
                    >
                      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Replace Rent
                      Contract
                    </Button>
                  )}
                </div>
                {!canView && (
                  <p className="mt-2 text-muted-foreground">
                    You do not have permission to open documents.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-canvas p-3 text-xs">
                <p className="text-muted-foreground">
                  No signed Rent Contract has been uploaded yet.
                </p>
                {canManage && (
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => input.current?.click()}
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Upload Rent Contract
                  </Button>
                )}
              </div>
            )}
            <input
              ref={input}
              type="file"
              accept={cat.accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              {cat.extensions.join(", ").toUpperCase()} · up to {cat.maxMb} MB
            </p>
          </div>
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Addenda and other documents</h4>
        <div className="mt-2">
          <DocumentList
            documents={others}
            emptyText="No other documents yet."
            actions={
              canManage
                ? (d) => (
                    <button
                      type="button"
                      className="font-medium text-foreground hover:underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() =>
                        attachAsContract(d.id)
                          .then(() => toast.success("Set as the Rent Contract"))
                          .catch((e) => toast.error((e as Error).message))
                      }
                    >
                      Set as Rent Contract
                    </button>
                  )
                : undefined
            }
          />
        </div>
        {canManage && (
          <div className="mt-3">
            <UploadDropzone
              title="Upload an addendum or other tenancy document"
              categoryKey="tenant_documents"
              propertyLeaseId={lease.id}
            />
          </div>
        )}
      </section>
    </div>
  );
}
