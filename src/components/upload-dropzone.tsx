import { UploadCloud } from "lucide-react";
import { Button } from "./ui-primitives";

export function UploadDropzone({
  title,
  description,
  accept,
}: {
  title: string;
  description?: string;
  accept?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-canvas text-foreground">
        <UploadCloud className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {accept ? (
        <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          {accept}
        </p>
      ) : null}
      <Button variant="outline" size="sm" className="mt-4" disabled>
        Browse files
      </Button>
    </div>
  );
}
