import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ImageOff, Loader2, Star, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { ConfirmDialog } from "./confirm-dialog";
import {
  propertyKeys,
  useAddPropertyMedia,
  usePropertyMedia,
  useRemovePropertyMedia,
  useReorderPropertyMedia,
  useSetHeroMedia,
} from "@/hooks/use-properties";
import { getSignedPreviewUrl, useDeleteUpload, useUploadFile } from "@/hooks/use-uploads";
import { UPLOAD_CATEGORIES, type Upload } from "@/lib/db";
import { galleryRows, idsAfterMove, imageProblem, type MediaRow } from "@/lib/property-images";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

// The Media section of a property: upload photos, see them at once, choose the hero, put them in order, remove
// them. A photo counts as added only when it is really in the property's gallery. If the file reaches storage
// but cannot be linked to the property, the tile says so and offers Retry; it never reports success.

const IMAGE_CATEGORY = UPLOAD_CATEGORIES.property_media;
const ACCEPTED_NOTE = `${IMAGE_CATEGORY.extensions.join(", ").toUpperCase()} - up to ${IMAGE_CATEGORY.maxMb} MB each`;

type QueueItem = {
  key: string;
  file: File;
  preview: string;
  status: "uploading" | "linking" | "failed";
  progress: number;
  error?: string;
  /** Set once the file is in storage, so Retry only has to link it. */
  uploadId?: string;
};

const problemWith = (file: File) => imageProblem(file, IMAGE_CATEGORY);

function useTileUrl(upload: MediaRow["uploads"]): string | null {
  const [url, setUrl] = useState<string | null>(upload?.public_url ?? null);
  useEffect(() => {
    if (!upload) return setUrl(null);
    if (upload.public_url) return setUrl(upload.public_url);
    let live = true;
    getSignedPreviewUrl(upload as unknown as Upload)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [upload?.id, upload?.public_url]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

function Tile({
  row,
  index,
  total,
  canEdit,
  canDelete,
  busy,
  onHero,
  onMove,
  onRemove,
}: {
  row: MediaRow;
  index: number;
  total: number;
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  onHero: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const url = useTileUrl(row.uploads);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const btn =
    "inline-flex h-7 items-center justify-center rounded-md border border-border bg-canvas px-2 text-[11px] font-medium hover:bg-muted disabled:opacity-40";
  return (
    <li className={cn("overflow-hidden rounded-xl border bg-background", row.is_hero ? "border-qbay" : "border-border")}>
      <div className="relative aspect-[4/3] bg-muted">
        {url && !failed ? (
          <img
            src={url}
            alt={row.uploads?.filename ?? "Property photo"}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            <span className="line-clamp-2 break-all">{row.uploads?.filename}</span>
          </div>
        )}
        {row.is_hero && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
            <Star className="h-3 w-3" /> Hero
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] tabular-nums text-white">
          {index + 1} / {total}
        </span>
      </div>
      {(canEdit || canDelete) && (
        <div className="flex items-center justify-between gap-1 p-2">
          {canEdit && !row.is_hero ? (
            <button type="button" className={btn} onClick={onHero} disabled={busy}>
              Set as hero
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">{row.is_hero ? "Cover photo" : ""}</span>
          )}
          <div className="flex items-center gap-1">
            {canEdit && (
              <>
                <button
                  type="button"
                  className={btn}
                  aria-label="Move earlier"
                  onClick={() => onMove(-1)}
                  disabled={busy || index === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={btn}
                  aria-label="Move later"
                  onClick={() => onMove(1)}
                  disabled={busy || index === total - 1}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {canDelete && (
              <button
                type="button"
                className={cn(btn, "text-destructive")}
                aria-label="Remove photo"
                onClick={onRemove}
                disabled={busy}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function PropertyMediaManager({
  propertyId,
  canUpload,
  canEdit,
  canDelete,
}: {
  propertyId: string;
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const { data: media = [], isLoading, isError, error, refetch } = usePropertyMedia(propertyId);
  const upload = useUploadFile();
  const add = useAddPropertyMedia();
  const setHero = useSetHeroMedia();
  const reorder = useReorderPropertyMedia();
  const remove = useRemovePropertyMedia();
  const deleteFile = useDeleteUpload();

  const rows = galleryRows(media as unknown as MediaRow[]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<MediaRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());

  useEffect(
    () => () => {
      previews.current.forEach((u) => URL.revokeObjectURL(u));
      previews.current.clear();
    },
    [],
  );

  const patchItem = useCallback((key: string, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);
  const dropItem = useCallback((key: string) => {
    setQueue((q) => {
      const gone = q.find((it) => it.key === key);
      if (gone) {
        URL.revokeObjectURL(gone.preview);
        previews.current.delete(gone.preview);
      }
      return q.filter((it) => it.key !== key);
    });
  }, []);

  /** Sends one file, then links it to the property. Returns true only when it is in the gallery. */
  const processItem = useCallback(
    async (item: QueueItem): Promise<boolean> => {
      let uploadId = item.uploadId;
      try {
        if (!uploadId) {
          patchItem(item.key, { status: "uploading", progress: 0, error: undefined });
          const row = await upload.mutateAsync({
            file: item.file,
            categoryKey: "property_media",
            propertyId,
            onProgress: (pct) => patchItem(item.key, { progress: pct }),
          });
          uploadId = row.id;
          patchItem(item.key, { uploadId, progress: 100 });
        }
        patchItem(item.key, { status: "linking" });
        await add.mutateAsync({ propertyId, uploadId });
        dropItem(item.key);
        return true;
      } catch (e) {
        const message = (e as Error).message || "Something went wrong.";
        patchItem(item.key, {
          status: "failed",
          error: uploadId
            ? `The file was uploaded but could not be added to this property: ${message}`
            : message,
        });
        return false;
      }
    },
    [add, dropItem, patchItem, propertyId, upload],
  );

  async function addFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const items: QueueItem[] = [];
    let skipped = 0;
    for (const file of files) {
      const problem = problemWith(file);
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      const item: QueueItem = {
        key: crypto.randomUUID(),
        file,
        preview,
        status: problem ? "failed" : "uploading",
        progress: 0,
        error: problem ?? undefined,
      };
      if (problem) skipped++;
      items.push(item);
    }
    setQueue((q) => [...q, ...items]);
    if (inputRef.current) inputRef.current.value = "";

    let added = 0;
    for (const item of items) {
      if (item.status === "failed") continue;
      if (await processItem(item)) added++;
    }
    const failed = items.length - added;
    if (added > 0 && failed === 0) toast.success(`${added} ${added === 1 ? "photo" : "photos"} added to the gallery`);
    else if (added > 0) toast.warning(`${added} added to the gallery. ${failed} did not make it, see below.`);
    else if (failed > 0 && skipped < items.length) toast.error("No photos were added. See the messages below.");
    else if (skipped > 0) toast.error("Those files cannot be added. See the messages below.");
  }

  async function retry(item: QueueItem) {
    const fresh = { ...item, status: "uploading" as const, error: undefined };
    patchItem(item.key, { status: "uploading", error: undefined });
    const ok = await processItem(fresh);
    if (ok) toast.success("Photo added to the gallery");
  }

  const busy = setHero.isPending || reorder.isPending || remove.isPending || deleteFile.isPending;

  async function removeRow(row: MediaRow) {
    try {
      await remove.mutateAsync({ propertyId, mediaId: row.id });
    } catch (e) {
      toast.error(`Could not remove the photo: ${(e as Error).message}`);
      return;
    }
    // Out of the gallery. Now delete the stored file; if that fails the photo is still gone from the property.
    try {
      if (row.uploads) await deleteFile.mutateAsync(row.uploads as unknown as Upload);
      toast.success("Photo removed");
    } catch (e) {
      toast.warning(`Removed from the gallery, but the stored file could not be deleted: ${(e as Error).message}`);
    }
    qc.invalidateQueries({ queryKey: propertyKeys.media(propertyId) });
  }

  return (
    <section aria-label="Property photos">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">Photos</h3>
        <p className="text-xs text-muted-foreground">
          {rows.length === 0 ? "No photos yet" : `${rows.length} ${rows.length === 1 ? "photo" : "photos"}`}
        </p>
      </div>

      {canUpload && (
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border border-dashed bg-background px-6 py-8 text-center transition-colors",
            dragging ? "border-foreground bg-muted" : "border-border",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
        >
          <UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" strokeWidth={1.8} />
          <p className="text-sm font-semibold">Upload property photos</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Drop images here or browse. They appear in the gallery below as soon as they are added. To add many
            properties from a spreadsheet, use Import from Excel on the Properties list instead.
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{ACCEPTED_NOTE}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={IMAGE_CATEGORY.accept}
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
          <Button variant="outline" size="sm" className="mt-3" onClick={() => inputRef.current?.click()}>
            Browse images
          </Button>
        </div>
      )}

      {queue.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {queue.map((it) => (
            <li key={it.key} className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
              <img src={it.preview} alt="" className="h-12 w-12 flex-shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{it.file.name}</p>
                {it.status === "uploading" && (
                  <div className="mt-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-qbay transition-all" style={{ width: `${it.progress}%` }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Uploading {it.progress}%</p>
                  </div>
                )}
                {it.status === "linking" && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Adding to the gallery
                  </p>
                )}
                {it.status === "failed" && (
                  <p role="alert" className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" /> {it.error}
                  </p>
                )}
              </div>
              {it.status === "failed" && (
                <div className="flex flex-shrink-0 items-center gap-1">
                  {!problemWith(it.file) && (
                    <Button size="sm" variant="outline" onClick={() => void retry(it)}>
                      Retry
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => dropItem(it.key)}
                    className="rounded-md p-1.5 hover:bg-muted"
                    aria-label={`Dismiss ${it.file.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isLoading && <p className="mt-4 text-xs text-muted-foreground">Loading photos...</p>}
      {isError && (
        <p role="alert" className="mt-4 text-xs text-destructive">
          Could not load the photos: {(error as Error).message}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      )}

      {rows.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((row, index) => (
            <Tile
              key={row.id}
              row={row}
              index={index}
              total={rows.length}
              canEdit={canEdit}
              canDelete={canDelete}
              busy={busy}
              onHero={() =>
                setHero.mutate(
                  { propertyId, mediaId: row.id },
                  {
                    onSuccess: () => toast.success("Hero photo updated"),
                    onError: (e) => toast.error(`Could not set the hero: ${(e as Error).message}`),
                  },
                )
              }
              onMove={(direction) => {
                const ids = idsAfterMove(rows, index, direction);
                if (!ids) return;
                reorder.mutate(
                  { propertyId, orderedIds: ids },
                  { onError: (e) => toast.error(`Could not reorder: ${(e as Error).message}`) },
                );
              }}
              onRemove={() => setConfirm(row)}
            />
          ))}
        </ul>
      )}

      {!isLoading && !isError && rows.length === 0 && queue.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          This property has no photos yet.{canUpload ? " Upload the first one above; it becomes the hero." : ""}
        </p>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="Remove this photo?"
        description={`${confirm?.uploads?.filename ?? "This photo"} is removed from the gallery and its file is deleted.${confirm?.is_hero ? " It is the hero, so the next photo becomes the hero." : ""}`}
        confirmLabel="Remove"
        destructive
        pending={remove.isPending || deleteFile.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const row = confirm;
          setConfirm(null);
          if (row) await removeRow(row);
        }}
      />
    </section>
  );
}
