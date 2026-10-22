import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "@/lib/db";
import type { Json, Tables } from "@/integrations/supabase/types";
import { uploadKeys, useUploadFile } from "@/hooks/use-uploads";
import type { Offer } from "@/hooks/use-offers";
import type { OfferFormType, OfferFormValues } from "@/lib/offer-forms";

export type OfferFormRecord = Tables<"offer_forms">;

export const offerFormKeys = {
  all: ["offer-forms"] as const,
  byOffer: (offerId: string) => ["offer-forms", "offer", offerId] as const,
  context: (offerId: string) => ["offer-forms", "context", offerId] as const,
};

/** The Booking and Reservation forms generated for one offer, newest first. */
export function useOfferForms(offerId: string | undefined) {
  return useQuery({
    queryKey: offerId ? offerFormKeys.byOffer(offerId) : ["offer-forms", "offer", "none"],
    enabled: !!offerId,
    queryFn: async (): Promise<OfferFormRecord[]> => {
      const { data, error } = await sb
        .from("offer_forms")
        .select("*")
        .eq("offer_id", offerId!)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type OfferFormContext = {
  lead: { full_name: string | null; phone: string | null; email: string | null } | null;
  property: {
    location: string | null;
    tower_name: string | null;
    floor_number: string | null;
    unit_number: string | null;
    bedrooms: number | null;
    size: number | null;
    size_unit: string | null;
    built_up_area: number | null;
    built_up_area_unit: string | null;
    price: number | null;
    currency: string | null;
  } | null;
  development: { name: string | null } | null;
  areaName: string | null;
  placeName: string | null;
};

/** Everything the CRM already knows that goes on a form: the lead, the property and its location, the development. */
export function useOfferFormContext(
  offer: Pick<Offer, "id" | "lead_id" | "property_id" | "development_id">,
  enabled: boolean,
) {
  return useQuery({
    queryKey: offerFormKeys.context(offer.id),
    enabled,
    queryFn: async (): Promise<OfferFormContext> => {
      const [leadRes, propRes] = await Promise.all([
        sb.from("leads").select("full_name, phone, email").eq("id", offer.lead_id).maybeSingle(),
        offer.property_id
          ? sb
              .from("properties")
              .select(
                "location, tower_name, floor_number, unit_number, bedrooms, size, size_unit, built_up_area, built_up_area_unit, price, currency, development_id, areas(name), places(name)",
              )
              .eq("id", offer.property_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (leadRes.error) throw leadRes.error;
      if (propRes.error) throw propRes.error;

      const prop = propRes.data as
        | (NonNullable<OfferFormContext["property"]> & {
            development_id: string | null;
            areas: { name: string } | null;
            places: { name: string } | null;
          })
        | null;

      const developmentId = offer.development_id ?? prop?.development_id ?? null;
      let development: OfferFormContext["development"] = null;
      if (developmentId) {
        const { data, error } = await sb
          .from("developments")
          .select("name")
          .eq("id", developmentId)
          .maybeSingle();
        if (error) throw error;
        development = data;
      }

      return {
        lead: leadRes.data,
        property: prop,
        development,
        areaName: prop?.areas?.name ?? null,
        placeName: prop?.places?.name ?? null,
      };
    },
  });
}

/**
 * Saves a generated form: stores the PDF with the offer (and its lead) in private storage, then records
 * the values that were printed so the same form can be regenerated.
 */
export function useSaveGeneratedForm() {
  const qc = useQueryClient();
  const upload = useUploadFile();
  return useMutation({
    mutationFn: async (input: {
      offer: Pick<Offer, "id" | "lead_id" | "property_id">;
      type: OfferFormType;
      values: OfferFormValues;
      pdf: File;
    }): Promise<OfferFormRecord> => {
      const formId = crypto.randomUUID();
      const file = await upload.mutateAsync({
        file: input.pdf,
        categoryKey: "offer_attachments",
        offerId: input.offer.id,
        leadId: input.offer.lead_id,
        metadata: { kind: "generated_form", form_type: input.type, form_id: formId },
      });
      const { data, error } = await sb
        .from("offer_forms")
        .insert({
          id: formId,
          offer_id: input.offer.id,
          lead_id: input.offer.lead_id,
          property_id: input.offer.property_id,
          form_type: input.type,
          form_data: input.values as unknown as Json,
          generated_upload_id: file.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: offerFormKeys.byOffer(vars.offer.id) });
      qc.invalidateQueries({ queryKey: uploadKeys.all });
    },
  });
}

/** Uploads the signed (or completed) copy of a form back to the same offer and marks the form signed. */
export function useAttachSignedForm() {
  const qc = useQueryClient();
  const upload = useUploadFile();
  return useMutation({
    mutationFn: async (input: {
      form: Pick<OfferFormRecord, "id" | "offer_id" | "lead_id" | "form_type">;
      file: File;
    }): Promise<OfferFormRecord> => {
      const file = await upload.mutateAsync({
        file: input.file,
        categoryKey: "offer_attachments",
        offerId: input.form.offer_id,
        leadId: input.form.lead_id,
        metadata: { kind: "signed_form", form_type: input.form.form_type, form_id: input.form.id },
      });
      const { data, error } = await sb
        .from("offer_forms")
        .update({ signed_upload_id: file.id })
        .eq("id", input.form.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: offerFormKeys.byOffer(vars.form.offer_id) });
      qc.invalidateQueries({ queryKey: uploadKeys.all });
    },
  });
}

export function useDeleteOfferForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: Pick<OfferFormRecord, "id" | "offer_id">) => {
      const { error } = await sb.from("offer_forms").delete().eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: (_d, form) =>
      qc.invalidateQueries({ queryKey: offerFormKeys.byOffer(form.offer_id) }),
  });
}
