import { useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useUploadFile, UploadValidationError } from "@/hooks/use-uploads";
import type { UploadCategoryKey } from "@/lib/db";
import { cn } from "@/lib/utils";

const linkCls = "self-start text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline";
const urlInputCls =
  "h-9 flex-1 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

/**
 * Staff-facing hero image control for property and development forms.
 * Upload is the primary path (drag/drop or browse, straight into Supabase
 * Storage via the existing uploads architecture); a raw URL stays available
 * as a secondary fallback behind "Use image URL instead".
 */
export function HeroImageField({
  value,
  onChange,
  categoryKey,
  propertyId,
  label = "image",
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  categoryKey: UploadCategoryKey;
  propertyId?: string | null;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const upload = useUploadFile();

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    try {
      const row = await upload.mutateAsync({ file, categoryKey, propertyId });
      onChange(row.public_url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof UploadValidationError ? err.message : (err as Error).message);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      onChange={(e) => handleFiles(e.target.files)}
    />
  );

  if (urlMode) {
    return (
      <div className="flex flex-col gap-1.5">
        <input
          className={urlInputCls}
          placeholder="https://..."
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
        <button type="button" onClick={() => setUrlMode(false)} className={linkCls}>
          Upload an {label} instead
        </button>
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="group relative overflow-hidden rounded-lg border border-border bg-canvas">
          <img src={value} alt={label} className="h-40 w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              className="rounded-md bg-white/95 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white disabled:opacity-60"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-md bg-white/95 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-white"
            >
              Remove
            </button>
          </div>
          {upload.isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}
        </div>
        {fileInput}
        <button type="button" onClick={() => setUrlMode(true)} className={linkCls}>
          Use image URL instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-background px-4 py-8 text-center transition-colors",
          dragging ? "border-foreground bg-muted" : "border-border",
        )}
      >
        {upload.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <UploadCloud className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
        )}
        <p className="text-xs font-medium text-foreground">{upload.isPending ? "Uploading..." : "Click or drag an image to upload"}</p>
        <p className="text-[11px] text-muted-foreground">JPG, PNG or WEBP - max 20MB</p>
      </div>
      {fileInput}
      <button type="button" onClick={() => setUrlMode(true)} className={linkCls}>
        Use image URL instead
      </button>
    </div>
  );
}
