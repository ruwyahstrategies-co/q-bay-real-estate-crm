import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { downloadUpload } from "@/hooks/use-uploads";
import { fmtDateTime, fmtSize, type Upload } from "@/lib/db";

/**
 * A list of uploaded documents with a Download action. Files are private: the download goes
 * through a short-lived signed link, never a public URL.
 */
export function DocumentList({
  documents,
  badge,
  actions,
  emptyText = "No documents yet.",
}: {
  documents: Upload[];
  /** Small label shown next to a file name (for example "Rent Contract"). */
  badge?: (doc: Upload) => ReactNode;
  /** Extra actions shown after Download. */
  actions?: (doc: Upload) => ReactNode;
  emptyText?: string;
}) {
  if (documents.length === 0) return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-1.5">
      {documents.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-2 truncate">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{d.filename}</span>
            {badge?.(d)}
            <span className="shrink-0 text-muted-foreground">{fmtSize(d.file_size)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
            <span>{fmtDateTime(d.created_at)}</span>
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={() => downloadUpload(d).catch((e) => toast.error((e as Error).message))}
            >
              Download
            </button>
            {actions?.(d)}
          </div>
        </div>
      ))}
    </div>
  );
}
