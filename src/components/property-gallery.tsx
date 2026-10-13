import { useEffect, useState } from "react";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { getSignedPreviewUrl } from "@/hooks/use-uploads";
import { cn } from "@/lib/utils";

export type GalleryUpload = {
  id: string;
  filename: string;
  storage_bucket: string;
  storage_path: string;
  public_url?: string | null;
};

export type GalleryImage = { id: string; isHero: boolean; upload: GalleryUpload };

/** Resolves a stored upload to a displayable URL: its public URL when it has one, else a signed one. */
function useUploadUrl(upload: GalleryUpload | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!upload) {
      setUrl(null);
      return;
    }
    if (upload.public_url) {
      setUrl(upload.public_url);
      return;
    }
    let live = true;
    getSignedPreviewUrl(upload as never)
      .then((u) => {
        if (live) setUrl(u);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [upload?.id, upload?.public_url]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

function Frame({ upload, className, alt }: { upload: GalleryUpload; className?: string; alt?: string }) {
  const url = useUploadUrl(upload);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return (
      <span className={cn("flex h-full w-full items-center justify-center bg-muted text-muted-foreground", className)}>
        <Building2 className="h-6 w-6" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={alt ?? upload.filename}
      className={cn("h-full w-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Large photo plus a thumbnail strip. Starts on the hero image (or the first one) and every
 * thumbnail switches the large photo. Shows a quiet placeholder when the property has no photos.
 */
export function PropertyGallery({ images, className }: { images: GalleryImage[]; className?: string }) {
  const startIndex = Math.max(0, images.findIndex((i) => i.isHero));
  const [active, setActive] = useState(startIndex);
  useEffect(() => setActive(startIndex), [startIndex, images.length]);

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 text-muted-foreground",
          className,
        )}
      >
        <Building2 className="h-7 w-7" />
        <p className="text-xs">No photos yet</p>
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];
  const go = (delta: number) => setActive((i) => (i + delta + images.length) % images.length);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="group relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted">
        <Frame upload={current.upload} />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-canvas/90 text-foreground shadow-raised opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-canvas/90 text-foreground shadow-raised opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-foreground/70 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur">
              {Math.min(active, images.length - 1) + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.slice(0, 12).map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === active}
              className={cn(
                "h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border-2 transition",
                i === active ? "border-qbay" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Frame upload={img.upload} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
