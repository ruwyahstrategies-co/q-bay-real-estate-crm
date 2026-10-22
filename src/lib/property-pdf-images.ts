// Builds the property brochure from a property id: loads the property and its photos, makes every photo safe to
// embed, and hands the lot to the layout in property-pdf.ts.
//
// Download (either page) and Share both go through buildPropertyBrochure, so the two can never produce different
// documents, and the list page and the detail page give the same file for the same property.
//
// Photos are read in the browser so they can be placed in the PDF. A direct read of the public storage address is
// tried first; if the browser refuses it (the storage host only allows the CRM website origin through CORS) or the
// file is private, the r2-image-bytes function fetches the file on the server after the same access checks as the
// signed-link function. A photo that still cannot be loaded is counted and reported, never silently dropped.

import { supabase } from "@/integrations/supabase/client";
import { sb, type Property } from "@/lib/db";
import { APP_CONFIG } from "@/lib/config";
import { photosForDocument, type MediaRow, type MediaUpload } from "@/lib/property-images";
import { renderTextWithCanvas, isRtlText } from "@/lib/offer-forms-pdf";
import {
  buildPropertyPdf,
  hasArabic,
  propertyPdfFilename,
  type AdvisorContact,
  type PdfImage,
} from "@/lib/property-pdf";

/** Most photos placed in one brochure. Keeps the file small enough to email and the build fast. */
export const MAX_PDF_PHOTOS = 24;
const HERO_MAX_EDGE = 1800;
const GALLERY_MAX_EDGE = 1200;
const JPEG_QUALITY = 0.85;
const CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 20_000;

export type BrochureResult = {
  blob: Blob;
  filename: string;
  /** Photos placed in the document. */
  included: number;
  /** Photos that exist but could not be loaded (unsupported format, missing file, no access). */
  failed: number;
  /** Photos left out only because of the cap. */
  omitted: number;
};

type BrochureMediaRow = MediaRow & {
  uploads: (MediaUpload & { id: string; storage_provider?: string | null }) | null;
};

// ---- loading one photo -------------------------------------------------------------------------------------

async function fetchBlob(url: string): Promise<Blob> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { mode: "cors", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (blob.size === 0) throw new Error("empty file");
    return blob;
  } finally {
    clearTimeout(timer);
  }
}

async function relayBlob(uploadId: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke<Blob>("r2-image-bytes", {
    body: { uploadId },
  });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        if (body?.error) message = body.error;
      } catch {
        // keep the message above
      }
    }
    throw new Error(message);
  }
  if (!(data instanceof Blob) || data.size === 0) throw new Error("no image data returned");
  return data;
}

async function privateStorageBlob(upload: {
  storage_bucket: string;
  storage_path: string;
}): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(upload.storage_bucket)
    .download(upload.storage_path);
  if (error || !data) throw new Error(error?.message ?? "download failed");
  return data;
}

/** The bytes of a photo, by the most direct route that works. */
async function photoBlob(upload: NonNullable<BrochureMediaRow["uploads"]>): Promise<Blob> {
  if (upload.storage_provider === "r2") {
    if (upload.public_url) {
      try {
        return await fetchBlob(upload.public_url);
      } catch {
        // blocked by CORS, offline, or not public after all: use the server relay below
      }
    }
    return relayBlob(upload.id);
  }
  if (upload.public_url) {
    try {
      return await fetchBlob(upload.public_url);
    } catch {
      // fall through to storage
    }
  }
  return privateStorageBlob(upload);
}

async function decode(
  blob: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // fall back to an image element below
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => undefined,
    };
  } finally {
    // the decoded pixels stay valid after the address is released
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Re-draws a photo as a JPEG no larger than maxEdge, on white, so any source format embeds the same way. */
async function toPdfImage(
  blob: Blob,
  maxEdge: number,
  format: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<PdfImage> {
  const decoded = await decode(blob);
  try {
    if (!decoded.width || !decoded.height) throw new Error("unreadable image");
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("canvas unavailable");
    if (format === "image/jpeg") {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, width, height);
    }
    g.imageSmoothingQuality = "high";
    g.drawImage(decoded.source, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL(format, JPEG_QUALITY), width, height };
  } finally {
    decoded.close();
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function loadLogo(): Promise<PdfImage | null> {
  try {
    const blob = await fetchBlob(`${window.location.origin}/favicon.png`);
    return await toPdfImage(blob, 256, "image/png");
  } catch {
    return null;
  }
}

async function loadTitleImage(title: string): Promise<PdfImage | null> {
  if (!hasArabic(title)) return null;
  try {
    const widthPt = 515;
    const heightPt = 30;
    const bytes = await renderTextWithCanvas(title.replace(/\s+/g, " ").trim(), {
      widthPt,
      heightPt,
      sizePt: 18,
      rtl: isRtlText(title),
      align: isRtlText(title) ? "right" : "left",
    });
    const dataUrl = `data:image/png;base64,${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`;
    return { dataUrl, width: widthPt, height: heightPt };
  } catch {
    return null;
  }
}

// ---- the brochure ------------------------------------------------------------------------------------------

type PropertyWithDevelopment = Property & { developments?: { name: string } | null };

export async function buildPropertyBrochure(
  propertyId: string,
  advisor: AdvisorContact,
): Promise<BrochureResult> {
  const [{ data: property, error: propertyError }, { data: media, error: mediaError }] =
    await Promise.all([
      sb.from("properties").select("*, developments(name)").eq("id", propertyId).maybeSingle(),
      sb
        .from("property_media")
        .select(
          "id, is_hero, display_order, media_type, created_at, uploads(id, filename, storage_provider, storage_bucket, storage_path, public_url, mime_type)",
        )
        .eq("property_id", propertyId),
    ]);
  if (propertyError) throw new Error(`Could not load the property: ${propertyError.message}`);
  if (!property)
    throw new Error("This property could not be found, or you do not have access to it.");
  if (mediaError) throw new Error(`Could not load the property photos: ${mediaError.message}`);

  const p = property as PropertyWithDevelopment;
  const { included, omitted } = photosForDocument(
    (media ?? []) as unknown as BrochureMediaRow[],
    p.hero_image_url,
    MAX_PDF_PHOTOS,
  );

  // Hero is the first row; if it cannot be loaded, the next photo that can be loaded takes its place.
  const loaded = await mapLimit(included, CONCURRENCY, async (row, i): Promise<PdfImage | null> => {
    try {
      return await toPdfImage(
        await photoBlob(row.uploads!),
        i === 0 ? HERO_MAX_EDGE : GALLERY_MAX_EDGE,
      );
    } catch {
      return null;
    }
  });
  const images = loaded.filter((x): x is PdfImage => x !== null);
  const failed = included.length - images.length;

  const [logo, titleImage] = await Promise.all([loadLogo(), loadTitleImage(p.title ?? "")]);

  const blob = buildPropertyPdf({
    property: p,
    developmentName: p.developments?.name ?? null,
    hero: images[0] ?? null,
    gallery: images.slice(1),
    omittedPhotos: omitted,
    logo,
    advisor,
    titleImage,
  });
  return { blob, filename: propertyPdfFilename(p), included: images.length, failed, omitted };
}

// ---- Download and Share ------------------------------------------------------------------------------------

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Builds the brochure and saves it. Returns the build summary so the caller can report missing photos. */
export async function downloadPropertyPdf(
  propertyId: string,
  advisor: AdvisorContact,
): Promise<BrochureResult> {
  const result = await buildPropertyBrochure(propertyId, advisor);
  saveBlob(result.blob, result.filename);
  return result;
}

/** Shares the same brochure through the device share sheet when it can, otherwise downloads it. */
export async function sharePropertyPdf(
  propertyId: string,
  advisor: AdvisorContact,
): Promise<BrochureResult & { outcome: "shared" | "downloaded" | "cancelled" }> {
  const result = await buildPropertyBrochure(propertyId, advisor);
  const file = new File([result.blob], result.filename, { type: "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `${APP_CONFIG.companyName} property brochure`,
      });
      return { ...result, outcome: "shared" };
    } catch (e) {
      if ((e as Error).name === "AbortError") return { ...result, outcome: "cancelled" };
      // any other failure: fall back to a normal download below
    }
  }
  saveBlob(result.blob, result.filename);
  return { ...result, outcome: "downloaded" };
}

/** One sentence about photos that did not make it, or null when everything was included. */
export function brochurePhotoNote(
  r: Pick<BrochureResult, "included" | "failed" | "omitted">,
): string | null {
  const parts: string[] = [];
  if (r.failed > 0) parts.push(`${r.failed} photo${r.failed === 1 ? "" : "s"} could not be loaded`);
  if (r.omitted > 0)
    parts.push(
      `${r.omitted} more photo${r.omitted === 1 ? " was" : "s were"} left out to keep the file small`,
    );
  return parts.length ? `${parts.join(" and ")}.` : null;
}
