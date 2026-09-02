import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, type InvoiceInsert, type InvoiceLineItemInsert, type PaymentInsert } from "@/lib/db";

const invoiceKeys = {
  all: ["invoices"] as const,
  payments: ["payments"] as const,
};

export function useInvoices(type?: "receivable" | "payable") {
  return useQuery({
    queryKey: [...invoiceKeys.all, type ?? "all"],
    queryFn: async () => {
      let q = sb
        .from("invoices")
        .select("*, owners(name), leads(full_name), properties(title, reference_code), team_members(full_name)")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (type) q = q.eq("type", type);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvoiceLineItems(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoice_line_items", invoiceId ?? "none"],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await sb.from("invoice_line_items").select("*").eq("invoice_id", invoiceId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoice, lineItems }: { invoice: InvoiceInsert; lineItems?: Omit<InvoiceLineItemInsert, "invoice_id">[] }) => {
      const { data, error } = await sb.from("invoices").insert(invoice).select().single();
      if (error) throw error;
      if (lineItems?.length) {
        const { error: liErr } = await sb.from("invoice_line_items").insert(lineItems.map((li) => ({ ...li, invoice_id: data.id })));
        if (liErr) throw liErr;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<InvoiceInsert> }) => {
      const { data, error } = await sb.from("invoices").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invoiceKeys.all }),
  });
}

export function usePayments() {
  return useQuery({
    queryKey: invoiceKeys.payments,
    queryFn: async () => {
      const { data, error } = await sb.from("payments").select("*, invoices(invoice_number, type)").order("received_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentInsert) => {
      const { data, error } = await sb.from("payments").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.payments });
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}
