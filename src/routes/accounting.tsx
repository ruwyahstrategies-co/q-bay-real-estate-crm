import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Wallet, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, Button } from "@/components/ui-primitives";
import { MetricCard } from "@/components/metric-card";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DrawerShell } from "@/components/overlay";
import { SelectField } from "@/components/select-field";
import { usePermissions } from "@/hooks/use-auth";
import { useTransactions, useCreateTransaction, useDeleteTransaction } from "@/hooks/use-transactions";
import { useProperties } from "@/hooks/use-properties";
import { useLeads } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { fmtMoney, fmtDate, TRANSACTION_TYPES, type TransactionRow } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounting")({
  head: () => ({ meta: [{ title: "Accounting" }] }),
  component: AccountingPage,
});

const inputCls = "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function AccountingPage() {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TransactionRow | null>(null);
  const { data: transactions = [] } = useTransactions();
  const del = useDeleteTransaction();
  const { can } = usePermissions();
  const canManage = can("accounting", "manage");

  const closed = transactions.filter((t) => t.status === "closed");
  const totalIncome = closed.reduce((a, t) => a + (t.income ?? 0), 0);
  const totalExpense = closed.reduce((a, t) => a + (t.expense ?? 0), 0);
  const totalCommission = closed.reduce((a, t) => a + (t.commission_value ?? 0), 0);
  const pipelineValue = transactions.filter((t) => t.status === "pending").reduce((a, t) => a + (t.transaction_value ?? 0), 0);

  const now = new Date();
  const thisMonth = closed.filter((t) => t.closed_at && new Date(t.closed_at).getMonth() === now.getMonth() && new Date(t.closed_at).getFullYear() === now.getFullYear());
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = closed.filter((t) => t.closed_at && new Date(t.closed_at).getMonth() === lastMonthDate.getMonth() && new Date(t.closed_at).getFullYear() === lastMonthDate.getFullYear());
  const thisMonthValue = thisMonth.reduce((a, t) => a + (t.transaction_value ?? 0), 0);
  const lastMonthValue = lastMonth.reduce((a, t) => a + (t.transaction_value ?? 0), 0);

  return (
    <AppShell>
      <PermissionGate module="accounting" action="view" page>
      <PageHeader
        eyebrow="Finance"
        title="Accounting"
        description="Sale/rental transactions, commissions and pipeline value."
        actions={canManage ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Transaction</Button> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Closed income" value={fmtMoney(totalIncome, "QAR")} />
        <MetricCard label="Closed expense" value={fmtMoney(totalExpense, "QAR")} />
        <MetricCard label="Commissions" value={fmtMoney(totalCommission, "QAR")} />
        <MetricCard label="Pipeline value" value={fmtMoney(pipelineValue, "QAR")} />
        <MetricCard label="This vs last month" value={fmtMoney(thisMonthValue, "QAR")} />
      </div>

      <Card className="mb-4">
        <p className="text-xs text-muted-foreground">
          This month: <strong>{fmtMoney(thisMonthValue, "QAR")}</strong> across {thisMonth.length} deal{thisMonth.length === 1 ? "" : "s"} -
          last month: <strong>{fmtMoney(lastMonthValue, "QAR")}</strong> across {lastMonth.length} deal{lastMonth.length === 1 ? "" : "s"}.
        </p>
      </Card>

      <DataTable
        columns={["Type", "Property", "Agent", "Value", "Commission", "Status", "Closed", "Actions"]}
        empty={<EmptyState icon={<Wallet className="h-4 w-4" />} title="No transactions yet" description="Record a sale or rental transaction." />}
      >
        {transactions.map((t) => (
          <tr key={t.id} className="border-b border-border last:border-0 hover:bg-background/60">
            <td className="px-4 py-3 text-xs capitalize">{t.transaction_type.replace(/_/g, " ")}</td>
            <td className="px-4 py-3 text-sm">{(t as any).properties?.title ?? "-"}</td>
            <td className="px-4 py-3 text-xs">{(t as any).team_members?.full_name ?? "-"}</td>
            <td className="px-4 py-3 text-xs">{fmtMoney(t.transaction_value, t.currency)}</td>
            <td className="px-4 py-3 text-xs">{fmtMoney(t.commission_value, t.currency)}</td>
            <td className="px-4 py-3 text-xs">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", t.status === "closed" ? "bg-pastel-green" : t.status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-pastel-blue")}>{t.status}</span>
            </td>
            <td className="px-4 py-3 text-xs">{t.closed_at ? fmtDate(t.closed_at) : "-"}</td>
            <td className="px-4 py-3">
              {canManage && <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={() => setConfirmDelete(t)}><Trash2 className="h-3.5 w-3.5" /></button>}
            </td>
          </tr>
        ))}
      </DataTable>

      <TransactionDrawer open={open} onOpenChange={setOpen} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete transaction?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Transaction deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
      </PermissionGate>
    </AppShell>
  );
}

function TransactionDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateTransaction();
  const { data: properties = [] } = useProperties({ status: "all" });
  const { data: leads = [] } = useLeads({ status: "all" });
  const { data: team = [] } = useTeamMembers();

  const [type, setType] = useState<string>("sale");
  const [propertyId, setPropertyId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [value, setValue] = useState("");
  const [commission, setCommission] = useState("");
  const [status, setStatus] = useState("pending");
  const [closedAt, setClosedAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setType("sale"); setPropertyId(""); setLeadId(""); setAgentId(""); setValue(""); setCommission(""); setStatus("pending"); setClosedAt(""); setNotes("");
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        transaction_type: type,
        property_id: propertyId || null,
        lead_id: leadId || null,
        agent_id: agentId || null,
        transaction_value: value ? Number(value) : null,
        commission_value: commission ? Number(commission) : null,
        income: commission ? Number(commission) : null,
        status,
        closed_at: status === "closed" ? (closedAt || new Date().toISOString().slice(0, 10)) : null,
        notes: notes || null,
      });
      toast.success("Transaction recorded");
      onOpenChange(false);
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="Add transaction">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">Add Transaction</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <form className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</span>
          <SelectField
            value={type}
            onChange={(v) => setType(v ?? "sale")}
            options={TRANSACTION_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))}
            allowClear={false}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
          <SelectField
            value={status}
            onChange={(v) => setStatus(v ?? "pending")}
            options={[
              { value: "pending", label: "Pending" },
              { value: "closed", label: "Closed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            allowClear={false}
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Property</span>
          <SelectField value={propertyId || null} onChange={(v) => setPropertyId(v ?? "")} options={properties.map((p) => ({ value: p.id, label: p.title }))} placeholder="Select property" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lead / client</span>
          <SelectField value={leadId || null} onChange={(v) => setLeadId(v ?? "")} options={leads.map((l) => ({ value: l.id, label: l.full_name }))} placeholder="Select lead" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Agent</span>
          <SelectField value={agentId || null} onChange={(v) => setAgentId(v ?? "")} options={team.map((m) => ({ value: m.id, label: m.full_name }))} placeholder="Select agent" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Transaction value</span>
          <input className={inputCls} type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Commission</span>
          <input className={inputCls} type="number" value={commission} onChange={(e) => setCommission(e.target.value)} />
        </label>
        {status === "closed" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Closed date</span>
            <input className={inputCls} type="date" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notes</span>
          <textarea className={cn(inputCls, "h-20 py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" size="sm" disabled={create.isPending}>{create.isPending ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </DrawerShell>
  );
}
