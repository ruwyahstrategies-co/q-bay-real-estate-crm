import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { downloadUpload, getSignedPreviewUrl } from "@/hooks/use-uploads";
import { isImageName } from "@/lib/activity";
import type { Upload } from "@/lib/db";

function Thumb({ file }: { file: Upload }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getSignedPreviewUrl(file).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [file]);
  if (!url)
    return (
      <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
        ...
      </span>
    );
  return (
    <img
      src={url}
      alt={file.filename}
      className="h-14 w-14 rounded-lg object-cover"
      loading="lazy"
    />
  );
}

/** The screenshots and files saved as evidence for one conversation. Thumbnails for images, links for the rest. */
export function InteractionAttachments({ files }: { files: Upload[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Attachments">
      {files.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            title={`Download ${f.filename}`}
            onClick={() => downloadUpload(f).catch((e) => toast.error((e as Error).message))}
            className="group flex items-center gap-2 rounded-lg border border-border bg-canvas p-1 text-left text-[11px] hover:bg-muted"
          >
            {isImageName(f.filename) ? (
              <Thumb file={f} />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="h-5 w-5" />
              </span>
            )}
            <span className="max-w-[9rem] truncate pr-1">{f.filename}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
