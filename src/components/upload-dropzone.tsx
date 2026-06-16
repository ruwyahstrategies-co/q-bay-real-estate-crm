import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { useUploadFile, UploadValidationError } from "@/hooks/use-uploads";
import type { UploadCategoryKey } from "@/lib/db";
import { UPLOAD_CATEGORIES } from "@/lib/db";

export function UploadDropzone({
  title,
  description,
  categoryKey,
  leadId,
  propertyId,
  onUploaded,
}: {
  title: string;
  description?: string;
  categoryKey: UploadCategoryKey;
  leadId?: string | null;
  propertyId?: string | null;
  onUploaded?: (uploadId: string) => void;
}) {
  const cat = UPLOAD_CATEGORIES[categoryKey];
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useUploadFile();

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    for (const file of Array.from(files)) {
      try {
        const row = await upload.mutateAsync({ file, categoryKey, leadId, propertyId });
        toast.success(`Uploaded ${file.name}`);
        onUploaded?.(row.id);
      } catch (err) {
        if (err instanceof UploadValidationError) {
          toast.error(`${file.name}: ${err.message}`);
        } else {
          toast.error(`${file.name}: ${(err as Error).message}`);
        }
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed bg-background px-6 py-10 text-center transition-colors ${
        dragging ? "border-foreground bg-muted" : "border-border"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-canvas text-foreground">
        {upload.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" strokeWidth={1.8} />}
      </div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {description ? <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {cat.extensions.join(" · ").toUpperCase()} · max {cat.maxMb}MB
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={cat.accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button variant="outline" size="sm" className="mt-4" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
        {upload.isPending ? "Uploading…" : "Browse files"}
      </Button>
    </div>
  );
}
