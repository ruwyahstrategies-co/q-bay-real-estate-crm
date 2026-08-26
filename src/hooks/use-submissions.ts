import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sb, type PropertySubmission, type PropertySubmissionUpdate } from "@/lib/db";

export const submissionKeys = {
  all: ["property_submissions"] as const,
  list: () => ["property_submissions", "list"] as const,
};

export function useSubmissions() {
  return useQuery({
    queryKey: submissionKeys.list(),
    queryFn: async (): Promise<PropertySubmission[]> => {
      const { data, error } = await sb.from("property_submissions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PropertySubmissionUpdate }) => {
      const { data, error } = await sb.from("property_submissions").update(patch).eq("id", id).select().single();
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
    mutationFn: async ({ id, status, review_notes, reviewed_by }: { id: string; status: "approved" | "rejected"; review_notes?: string; reviewed_by: string }) => {
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

/** Converts an approved submission into a real property row, then marks the submission published. */
export function useConvertSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (submission: PropertySubmission) => {
      const { data: property, error: propErr } = await sb
        .from("properties")
        .insert({
          title: `${submission.property_type ?? "Property"} - ${submission.location ?? "Submitted listing"}`,
          description: submission.description,
          country_id: submission.country_id,
          area_id: submission.area_id,
          location: submission.location,
          property_type: submission.property_type,
          purpose: submission.purpose ?? "sale",
          price: submission.price,
          currency: submission.currency ?? "QAR",
          bedrooms: submission.bedrooms,
          bathrooms: submission.bathrooms,
          size: submission.size,
          listing_source: "owner_submission",
          status: "active",
          availability: "available",
        })
        .select()
        .single();
      if (propErr || !property) throw propErr ?? new Error("Failed to create property");

      const { error: subErr } = await sb
        .from("property_submissions")
        .update({ status: "published", converted_property_id: property.id })
        .eq("id", submission.id);
      if (subErr) throw subErr;

      return property;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: submissionKeys.all });
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
  });
}
