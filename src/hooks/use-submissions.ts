import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type PropertySubmission, type PropertySubmissionUpdate, type Upload } from "@/lib/db";
import { promoteSubmissionPhoto } from "@/lib/r2";

export const submissionKeys = {
  all: ["property_submissions"] as const,
  list: () => ["property_submissions", "list"] as const,
};

export function useSubmissions() {
  return useQuery({
    queryKey: submissionKeys.list(),
    queryFn: async (): Promise<PropertySubmission[]> => {
      const { data, error } = await sb
        .from("property_submissions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Every submission filed under one Owner - shown on the Owner's CRM profile. */
export function useOwnerSubmissions(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["property_submissions", "owner", ownerId ?? "none"],
    enabled: !!ownerId,
    queryFn: async (): Promise<PropertySubmission[]> => {
      const { data, error } = await sb
        .from("property_submissions")
        .select("*")
        .eq("owner_id", ownerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * R2-backed voice note / owner photos attached to a submission (linked via
 * uploads.property_submission_id). Separate from the legacy media/documents
 * jsonb columns, which keep working unchanged for older submissions.
 */
export function useSubmissionUploads(submissionId: string | undefined) {
  return useQuery({
    queryKey: ["property_submissions", "uploads", submissionId ?? "none"],
    enabled: !!submissionId,
    queryFn: async (): Promise<Upload[]> => {
      const { data, error } = await sb
        .from("uploads")
        .select("*")
        .eq("property_submission_id", submissionId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PropertySubmissionUpdate }) => {
      const { data, error } = await sb
        .from("property_submissions")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.all }),
  });
}

/** Review action: approve/reject with notes. */
export function useReviewSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      review_notes,
      reviewed_by,
    }: {
      id: string;
      status: "approved" | "rejected";
      review_notes?: string;
      reviewed_by: string;
    }) => {
      const { data, error } = await sb
        .from("property_submissions")
        .update({ status, review_notes, reviewed_by })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.all }),
  });
}

/**
 * property_submissions.purpose uses the public "Sell / Rent / Let" wording;
 * properties.purpose uses the CRM's own broader set and has no separate
 * "let" value. "Let" still stays fully intact on the submission record - it
 * is only collapsed into "rent" at the point a Property row is created,
 * which is a coarser, CRM-internal classification.
 */
function mapSubmissionPurposeToPropertyPurpose(purpose: string | null): string {
  if (purpose === "sell") return "sale";
  if (purpose === "rent" || purpose === "let") return "rent";
  return "sale";
}

/**
 * Converts an approved submission into a real property row, carrying every
 * Sale Listing Form field across so nothing has to be re-keyed, and links the
 * new property back to the Owner (and their assigned agent, so the reference
 * code generator can fire) and to this submission. Newly converted properties
 * are never published automatically - staff publish from the Properties page
 * once they've reviewed the listing.
 */
export function useConvertSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (submission: PropertySubmission) => {
      let assignedAgentId: string | null = null;
      if (submission.owner_id) {
        const { data: owner } = await sb
          .from("owners")
          .select("assigned_agent_id")
          .eq("id", submission.owner_id)
          .maybeSingle();
        assignedAgentId = owner?.assigned_agent_id ?? null;
      }

      const { data: property, error: propErr } = await sb
        .from("properties")
        .insert({
          title: `${submission.property_type ?? "Property"} - ${submission.location ?? "Submitted listing"}`,
          description: submission.description,
          country_id: submission.country_id,
          area_id: submission.area_id,
          development_id: submission.development_id,
          owner_id: submission.owner_id,
          assigned_agent_id: assignedAgentId,
          location:
            !submission.area_id && submission.custom_area
              ? [submission.custom_area, submission.location].filter(Boolean).join(", ")
              : submission.location,
          property_type: submission.property_type,
          purpose: mapSubmissionPurposeToPropertyPurpose(submission.purpose),
          price: submission.price,
          currency: submission.currency ?? "QAR",
          bedrooms: submission.bedrooms,
          bathrooms: submission.bathrooms,
          size: submission.size,
          tower_name: submission.tower_name,
          floor_number: submission.floor_number,
          unit_number: submission.unit_number,
          parking_spaces: submission.parking_spaces,
          furnishing_status: submission.furnishing_status,
          available_from: submission.available_from,
          listing_source: "owner_submission",
          status: "active",
          availability: "available",
          is_published: false,
        })
        .select()
        .single();
      if (propErr || !property) throw propErr ?? new Error("Failed to create property");

      const { error: subErr } = await sb
        .from("property_submissions")
        .update({ status: "converted", converted_property_id: property.id })
        .eq("id", submission.id);
      if (subErr) throw subErr;

      // Promote any R2-backed owner photos into the public property gallery.
      // Best-effort: a promotion failure must not fail the conversion itself
      // (the property + submission link are already saved) - staff can
      // still see and re-attempt from the submission's Photos section.
      const { data: r2Photos } = await sb
        .from("uploads")
        .select("id")
        .eq("property_submission_id", submission.id)
        .eq("category", "submission_photo")
        .eq("storage_provider", "r2");
      let photoPromotionFailures = 0;
      const photoPromotionTotal = r2Photos?.length ?? 0;
      if (r2Photos && r2Photos.length > 0) {
        const results = await Promise.allSettled(
          r2Photos.map((u) => promoteSubmissionPhoto({ uploadId: u.id, propertyId: property.id })),
        );
        photoPromotionFailures = results.filter((r) => r.status === "rejected").length;
        if (photoPromotionFailures > 0) {
          console.warn(`[convert-submission] ${photoPromotionFailures}/${photoPromotionTotal} submission photo(s) failed to promote`);
        }
      }

      return { property, photoPromotionFailures, photoPromotionTotal };
    },
    onSuccess: (_property, submission) => {
      qc.invalidateQueries({ queryKey: submissionKeys.all });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["property_submissions", "uploads", submission.id] });
    },
  });
}
