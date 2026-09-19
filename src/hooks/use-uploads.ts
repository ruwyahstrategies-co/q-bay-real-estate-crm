import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type Upload, UPLOAD_CATEGORIES, type UploadCategoryKey } from "@/lib/db";
import { authorizeCrmUpload, deleteR2Upload, getR2SignedReadUrl, putToR2, resolveR2PublicUrl, R2NotConfiguredError } from "@/lib/r2";

export const uploadKeys = {
  all: ["uploads"] as const,
  list: (filters?: Record<string, unknown>) => ["uploads", "list", filters ?? {}] as const,
  byLead: (leadId: string) => ["uploads", "lead", leadId] as const,
  byProperty: (propertyId: string) => ["uploads", "property", propertyId] as const,
  byTenant: (tenantId: string) => ["uploads", "tenant", tenantId] as const,
  byLease: (leaseId: string) => ["uploads", "lease", leaseId] as const,
  byOffer: (offerId: string) => ["uploads", "offer", offerId] as const,
};

export function useUploads(opts?: {
  leadId?: string;
  propertyId?: string;
  ownerId?: string;
  tenantId?: string;
  propertyLeaseId?: string;
  offerId?: string;
  category?: string | null;
}) {
  const { leadId, propertyId, ownerId, tenantId, propertyLeaseId, offerId, category } = opts ?? {};
  return useQuery({
    queryKey: uploadKeys.list({
      leadId,
      propertyId,
      ownerId,
      tenantId,
      propertyLeaseId,
      offerId,
      category,
    }),
    queryFn: async (): Promise<Upload[]> => {
      let q = sb.from("uploads").select("*").order("created_at", { ascending: false });
      if (leadId) q = q.eq("lead_id", leadId);
      if (propertyId) q = q.eq("property_id", propertyId);
      if (ownerId) q = q.eq("owner_id", ownerId);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (propertyLeaseId) q = q.eq("property_lease_id", propertyLeaseId);
      if (offerId) q = q.eq("offer_id", offerId);
      if (category) q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export class UploadValidationError extends Error {}

/**
 * Media that must never silently fall back to Supabase Storage.
 * If R2 is unavailable/misconfigured, fail loudly so staff know the upload
 * did not reach Cloudflare. Documents can still use the legacy Supabase
 * fallback while the older storage path remains supported.
 */
const R2_REQUIRED_CATEGORIES = new Set<UploadCategoryKey>([
  "property_media",
  "development_media",
  "blog_images",
  "call_recordings",
  "brochures",
]);

async function readTextSafe(file: File): Promise<string | null> {
  try {
    return await file.text();
  } catch {
    return null;
  }
}

function processingStatusFor(ext: string): string {
  if (["txt", "csv"].includes(ext)) return "pending"; // filled in after text extraction below
  if (["mp3", "wav", "m4a"].includes(ext)) return "transcription_required";
  if (["pdf", "docx"].includes(ext)) return "uploaded";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "completed";
  if (ext === "zip") return "unsupported";
  if (ext === "xlsx") return "uploaded";
  return "uploaded";
}

export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      categoryKey,
      leadId,
      propertyId,
      ownerId,
      tenantId,
      propertyLeaseId,
      offerId,
      uploadedBy,
    }: {
      file: File;
      categoryKey: UploadCategoryKey;
      leadId?: string | null;
      propertyId?: string | null;
      ownerId?: string | null;
      tenantId?: string | null;
      propertyLeaseId?: string | null;
      offerId?: string | null;
      uploadedBy?: string | null;
    }): Promise<Upload> => {
      const cat = UPLOAD_CATEGORIES[categoryKey];
      const ext = extOf(file.name);
      if (!cat.extensions.includes(ext as never)) {
        throw new UploadValidationError(
          `Unsupported file extension ".${ext}". Allowed: ${cat.extensions.join(", ")}`,
        );
      }
      if (file.size > cat.maxMb * 1024 * 1024) {
        throw new UploadValidationError(`File exceeds ${cat.maxMb} MB limit.`);
      }

      let extracted_text: string | null = null;
      let processing_status = processingStatusFor(ext);
      if (["txt", "csv"].includes(ext)) {
        extracted_text = await readTextSafe(file);
        processing_status = extracted_text != null ? "completed" : "uploaded";
      }

      const contentType = file.type || "application/octet-stream";
      const entityId = propertyId ?? leadId ?? ownerId ?? tenantId ?? propertyLeaseId ?? offerId ?? crypto.randomUUID();

      // Try Cloudflare R2 first (the target architecture) - fall back to the
      // legacy Supabase Storage path only when R2 genuinely isn't configured
      // yet, never on a real rejection (permission/mime/size).
      try {
        const auth = await authorizeCrmUpload({
          categoryKey,
          entityId,
          filename: file.name,
          mimeType: contentType,
          sizeBytes: file.size,
        });
        await putToR2(auth.uploadUrl, file, contentType);

        const insertRow = {
          category: categoryKey,
          filename: file.name,
          storage_bucket: auth.bucket,
          storage_path: auth.objectKey,
          storage_provider: "r2" as const,
          bucket_scope: auth.scope,
          public_url: auth.scope === "public" ? resolveR2PublicUrl(auth.objectKey) : null,
          mime_type: contentType,
          file_size: file.size,
          lead_id: leadId ?? null,
          property_id: propertyId ?? null,
          owner_id: ownerId ?? null,
          tenant_id: tenantId ?? null,
          property_lease_id: propertyLeaseId ?? null,
          offer_id: offerId ?? null,
          uploaded_by: uploadedBy ?? null,
          processing_status,
          extracted_text,
          metadata: { extension: ext },
        };
        const { data, error } = await sb.from("uploads").insert(insertRow).select().single();
        if (error) throw error;
        return data;
      } catch (err) {
        if (!(err instanceof R2NotConfiguredError)) throw err;
        if (R2_REQUIRED_CATEGORIES.has(categoryKey)) {
          throw new Error(
            `Cloudflare R2 is required for ${cat.title}. The upload was NOT saved to Supabase Storage. Check the R2 Edge Function secrets/bucket configuration and try again.`,
          );
        }
        // Important/legacy document categories may still use Supabase Storage
        // as a compatibility fallback when R2 is genuinely unavailable.
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${crypto.randomUUID()}-${safeName}`;

      const { error: upErr } = await sb.storage.from(cat.bucket).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: pub } = sb.storage.from(cat.bucket).getPublicUrl(path);

      const insertRow = {
        category: categoryKey,
        filename: file.name,
        storage_bucket: cat.bucket,
        storage_path: path,
        storage_provider: "supabase" as const,
        public_url: pub.publicUrl,
        mime_type: file.type || null,
        file_size: file.size,
        lead_id: leadId ?? null,
        property_id: propertyId ?? null,
        owner_id: ownerId ?? null,
        tenant_id: tenantId ?? null,
        property_lease_id: propertyLeaseId ?? null,
        offer_id: offerId ?? null,
        uploaded_by: uploadedBy ?? null,
        processing_status,
        extracted_text,
        metadata: { extension: ext },
      };

      const { data, error } = await sb.from("uploads").insert(insertRow).select().single();
      if (error) {
        // Orphan cleanup
        await sb.storage.from(cat.bucket).remove([path]);
        throw error;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: uploadKeys.all }),
  });
}

export function useDeleteUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (upload: Upload) => {
      if (upload.storage_provider === "r2") {
        await deleteR2Upload(upload.id);
        return;
      }
      const { error: storageErr } = await sb.storage
        .from(upload.storage_bucket)
        .remove([upload.storage_path]);
      if (storageErr) throw storageErr;
      const { error } = await sb.from("uploads").delete().eq("id", upload.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: uploadKeys.all }),
  });
}

export async function downloadUpload(upload: Upload): Promise<void> {
  let blob: Blob;
  if (upload.storage_provider === "r2") {
    const signedUrl = await getR2SignedReadUrl(upload.id);
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`Failed to download file (HTTP ${res.status})`);
    blob = await res.blob();
  } else {
    const { data, error } = await sb.storage.from(upload.storage_bucket).download(upload.storage_path);
    if (error) throw error;
    blob = data;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = upload.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getSignedPreviewUrl(upload: Upload): Promise<string | null> {
  if (upload.storage_provider === "r2") {
    try {
      return await getR2SignedReadUrl(upload.id);
    } catch {
      return null;
    }
  }
  const { data, error } = await sb.storage
    .from(upload.storage_bucket)
    .createSignedUrl(upload.storage_path, 3600);
  if (error) return null;
  return data.signedUrl;
}
