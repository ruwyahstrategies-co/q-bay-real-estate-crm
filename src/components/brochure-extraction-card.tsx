import { useEffect, useState } from "react";
import { FileText, Sparkles, Loader2, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "@/components/ui-primitives";
import { UploadDropzone } from "@/components/upload-dropzone";
import { usePermissions } from "@/hooks/use-auth";
import { useUpdateDevelopment } from "@/hooks/use-developments";
import {
  useBrochureUpload,
  useExtractBrochure,
  useApproveBrochureExtraction,
  useDiscardBrochureExtraction,
  type BrochureExtraction,
} from "@/hooks/use-brochure-extraction";
import type { Development } from "@/lib/db";

export function BrochureExtractionCard({ development }: { development: Development }) {
  const { can } = usePermissions();
  const canEdit = can("developments", "edit");
  const linkDevelopment = useUpdateDevelopment();
  const { data: upload } = useBrochureUpload(development.brochure_upload_id);
  const extract = useExtractBrochure();
  const approve = useApproveBrochureExtraction();
  const discard = useDiscardBrochureExtraction();
  const [draft, setDraft] = useState<BrochureExtraction | null>(null);

  const extraction = (upload?.metadata as any)?.extraction as BrochureExtraction | undefined;

  useEffect(() => {
    if (upload?.processing_status === "extracted" && extraction) setDraft(extraction);
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload?.id, upload?.processing_status]);

  if (!canEdit) return null;

  if (!development.brochure_upload_id) {
    return (
      <Card>
        <h3 className="mb-2 text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Brochure</h3>
        <UploadDropzone
          title="Upload the development brochure"
          description="PDF brochure. Once uploaded, staff can run AI extraction and review the proposed fields before anything is published."
          categoryKey="development_documents"
          onUploaded={(uploadId) => linkDevelopment.mutate({ id: development.id, patch: { brochure_upload_id: uploadId } })}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Brochure</h3>
        <span className="text-[11px] capitalize text-muted-foreground">{upload?.processing_status ?? "..."}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{upload?.filename}</p>

      {(!upload || ["uploaded", "pending", "failed"].includes(upload.processing_status)) && (
        <div className="mt-3">
          {upload?.processing_error && <p className="mb-2 text-xs text-rose-600">{upload.processing_error}</p>}
          <Button
            size="sm"
            disabled={extract.isPending}
            onClick={async () => {
              try {
                await extract.mutateAsync(development.id);
                toast.success("Brochure extracted - review before publishing");
              } catch (e) { toast.error((e as Error).message); }
            }}
          >
            {extract.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Extract with AI
          </Button>
        </div>
      )}

      {upload?.processing_status === "processing" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading brochure...</p>
      )}

      {draft && (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Review before publishing - nothing below is live yet</p>

          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Description
            <textarea
              className="min-h-24 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-foreground"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>

          {draft.highlights.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground">Highlights (appended to description on approve)</p>
              <ul className="mt-1 list-disc pl-4 text-xs">{draft.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Amenities</p>
              <p className="text-xs">{draft.amenities.join(", ") || "-"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Property types</p>
              <p className="text-xs">{draft.property_types.join(", ") || "-"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Price range</p>
              <p className="text-xs">{draft.price_from ?? "-"} - {draft.price_to ?? "-"} {draft.currency ?? ""}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Completion / delivery</p>
              <p className="text-xs">{draft.completion_status ?? "-"} · {draft.delivery_timeline ?? "-"}</p>
            </div>
          </div>

          {draft.unit_mix.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground">Unit mix</p>
              <ul className="mt-1 space-y-1 text-xs">
                {draft.unit_mix.map((u, i) => (
                  <li key={i}>{u.type} · {u.beds ?? "-"} bed · {u.size_from_sqm ?? "-"}-{u.size_to_sqm ?? "-"} sqm · {u.price_from ?? "-"}-{u.price_to ?? "-"}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              disabled={approve.isPending}
              onClick={async () => {
                try {
                  await approve.mutateAsync({ developmentId: development.id, uploadId: development.brochure_upload_id!, fields: draft });
                  toast.success("Development fields updated from brochure");
                } catch (e) { toast.error((e as Error).message); }
              }}
            >
              <Check className="h-3.5 w-3.5" /> Approve & apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={discard.isPending}
              onClick={async () => {
                await discard.mutateAsync(development.brochure_upload_id!);
                toast.success("Extraction discarded");
              }}
            >
              <XIcon className="h-3.5 w-3.5" /> Discard
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
