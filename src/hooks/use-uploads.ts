import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type Upload, UPLOAD_CATEGORIES, type UploadCategoryKey } from "@/lib/db";

export const uploadKeys = {
  all: ["uploads"] as const,
  list: (filters?: Record<string, unknown>) => ["uploads", "list", filters ?? {}] as const,
  byLead: (leadId: string) => ["uploads", "lead", leadId] as const,
  byProperty: (propertyId: string) => ["uploads", "property", propertyId] as const,
};

export function useUploads(opts?: { leadId?: string; propertyId?: string; ownerId?: string; category?: string | null }) {
  const { leadId, propertyId, ownerId, category } = opts ?? {};
  return useQuery({
    queryKey: uploadKeys.list({ leadId, propertyId, ownerId, category }),
    queryFn: async (): Promise<Upload[]> => {
      let q = sb.from("uploads").select("*").order("created_at", { ascending: false });
      if (leadId) q = q.eq("lead_id", leadId);
      if (propertyId) q = q.eq("property_id", propertyId);
      if (ownerId) q = q.eq("owner_id", ownerId);
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

async function readTextSafe(file: File): Promise<string | null> {
  try {
    return await file.text();
  } catch {
    return null;
  }
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
      uploadedBy,
    }: {
      file: File;
      categoryKey: UploadCategoryKey;
      leadId?: string | null;
      propertyId?: string | null;
      ownerId?: string | null;
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

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${crypto.randomUUID()}-${safeName}`;

      const { error: upErr } = await sb.storage.from(cat.bucket).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;

      // Optional text extraction
      let extracted_text: string | null = null;
      let processing_status = "uploaded";
      if (["txt", "csv"].includes(ext)) {
        extracted_text = await readTextSafe(file);
        if (extracted_text != null) processing_status = "completed";
      } else if (["mp3", "wav", "m4a"].includes(ext)) {
        processing_status = "transcription_required";
      } else if (["pdf", "docx"].includes(ext)) {
        processing_status = "uploaded"; // server-side extraction not enabled
      } else if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
        processing_status = "completed";
      } else if (ext === "zip") {
        processing_status = "unsupported";
      } else if (ext === "xlsx") {
        processing_status = "uploaded";
      }

      // Public URL (works only if bucket is public; otherwise we'll use signed URLs)
      const { data: pub } = sb.storage.from(cat.bucket).getPublicUrl(path);

      const insertRow = {
        category: categoryKey,
        filename: file.name,
        storage_bucket: cat.bucket,
        storage_path: path,
        public_url: pub.publicUrl,
        mime_type: file.type || null,
        file_size: file.size,
        lead_id: leadId ?? null,
        property_id: propertyId ?? null,
        owner_id: ownerId ?? null,
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
      const { error: storageErr } = await sb.storage.from(upload.storage_bucket).remove([upload.storage_path]);
      if (storageErr) throw storageErr;
      const { error } = await sb.from("uploads").delete().eq("id", upload.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: uploadKeys.all }),
  });
}

export async function downloadUpload(upload: Upload): Promise<void> {
  const { data, error } = await sb.storage.from(upload.storage_bucket).download(upload.storage_path);
  if (error) throw error;
  const blob = data;
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
  const { data, error } = await sb.storage.from(upload.storage_bucket).createSignedUrl(upload.storage_path, 3600);
  if (error) return null;
  return data.signedUrl;
}
