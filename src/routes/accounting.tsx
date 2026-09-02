import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Wallet, Trash2, X, FileText } from "lucide-react";
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
import { SelectField, SearchableSelectField } from "@/components/select-field";
import { usePermissions } from "@/hooks/use-auth";
import { useTransactions, useCreateTransaction, useDeleteTransaction } from "@/hooks/use-transactions";
import { useInvoices, useCreateInvoice, useUpdateInvoice, useDeleteInvoice, usePayments, useRecordPayment } from "@/hooks/use-invoices";
import { useProperties } from "@/hooks/use-properties";
import { useOwners } from "@/hooks/use-owners";
import { useLeads } from "@/hooks/use-leads";
import { useTeamMembers } from "@/hooks/use-team";
import { fmtMoney, fmtDate, TRANSACTION_TYPES, INVOICE_TYPES, INVOICE_STATUSES, type TransactionRow } from "@/lib/db";
import { cn, titleCase } from "@/lib/utils";

export const Route = createFileRoute("/accounting")({
  head: () => ({ meta: [{ title: "Accounts" }] }),
  component: AccountingPage,
});

const inputCls = "h-9 rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const tabs = ["Overview", "Transactions", "Invoices", "Receivables", "Payables", "Payments", "Commissions"] as const;

function AccountingPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const { data: transactions = [] } = useTransactions();
  const { data: invoices = [] } = useInvoices();
  const { data: payments = [] } = usePayments();
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

  const receivables = invoices.filter((i: any) => i.type === "receivable" && !["paid", "cancelled"].includes(i.status));
  const payables = invoices.filter((i: any) => i.type === "payable" && !["paid", "cancelled"].includes(i.status));
  const outstandingReceivable = receivables.reduce((a: number, i: any) => a + (i.amount ?? 0), 0);
  const outstandingPayable = payables.reduce((a: number, i: any) => a + (i.amount ?? 0), 0);

  return (
    <AppShell>
      <PermissionGate module="accounting" action="view" page>
        <PageHeader
          eyebrow="Finance"
          title="Accounts"
          description="Transactions, invoices, receivables, payables, payments and commissions."
        />

        <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <MetricCard label="Closed income" value={fmtMoney(totalIncome, "QAR")} />
              <MetricCard label="Closed expense" value={fmtMoney(totalExpense, "QAR")} />
              <MetricCard label="Commissions" value={fmtMoney(totalCommission, "QAR")} />
              <MetricCard label="Outstanding receivable" value={fmtMoney(outstandingReceivable, "QAR")} tone="green" />
              <MetricCard label="Outstanding payable" value={fmtMoney(outstandingPayable, "QAR")} tone="purple" />
            </div>
            <Card>
              <p className="text-xs text-muted-foreground">
                This month: <strong>{fmtMoney(thisMonthValue, "QAR")}</strong> across {thisMonth.length} deal{thisMonth.length === 1 ? "" : "s"} -
                last month: <strong>{fmtMoney(lastMonthValue, "QAR")}</strong> across {lastMonth.length} deal{lastMonth.length === 1 ? "" : "s"}.
              </p>
            </Card>
            <Card>
              <p className="text-xs text-muted-foreground">
                Pipeline value (pending transactions): <strong>{fmtMoney(pipelineValue, "QAR")}</strong> · {receivables.length} open receivable{receivables.length === 1 ? "" : "s"} · {payables.length} open payable{payables.length === 1 ? "" : "s"}.
              </p>
            </Card>
          </div>
        )}

        {tab === "Transactions" && <TransactionsTab canManage={canManage} />}
        {tab === "Invoices" && <InvoicesTab canManage={canManage} kind={null} />}
        {tab === "Receivables" && <InvoicesTab canManage={canManage} kind="receivable" />}
        {tab === "Payables" && <InvoicesTab canManage={canManage} kind="payable" />}
        {tab === "Payments" && <PaymentsTab canManage={canManage} />}
        {tab === "Commissions" && <CommissionsTab />}
      </PermissionGate>
    </AppShell>
  );
}

function TransactionsTab({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TransactionRow | null>(null);
  const { data: transactions = [] } = useTransactions();
  const del = useDeleteTransaction();

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Transaction</Button>
        </div>
      )}
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
    </div>
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
          <SelectField value={type} onChange={(v) => setType(v ?? "sale")} options={TRANSACTION_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} allowClear={false} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
          <SelectField value={status} onChange={(v) => setStatus(v ?? "pending")} options={[{ value: "pending", label: "Pending" }, { value: "closed", label: "Closed" }, { value: "cancelled", label: "Cancelled" }]} allowClear={false} />
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

function InvoicesTab({ canManage, kind }: { canManage: boolean; kind: "receivable" | "payable" | null }) {
  const { data: invoices = [] } = useInvoices(kind ?? undefined);
  const update = useUpdateInvoice();
  const del = useDeleteInvoice();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> New Invoice</Button>
        </div>
      )}
      {invoices.length === 0 ? (
        <EmptyState icon={<FileText className="h-4 w-4" />} title="No invoices yet" />
      ) : (
        <div className="space-y-2">
          {invoices.map((inv: any) => (
            <Card key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium capitalize">
                  {inv.type} {inv.invoice_number ? `#${inv.invoice_number}` : ""} - {inv.owners?.name ?? inv.leads?.full_name ?? "Unlinked"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmtMoney(inv.amount, inv.currency)} {inv.due_date ? `· due ${fmtDate(inv.due_date)}` : ""} {inv.properties ? `· ${inv.properties.reference_code ?? inv.properties.title}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canManage ? (
                  <SelectField
                    className="h-8 w-32 text-xs"
                    value={inv.status}
                    onChange={(v) => update.mutate({ id: inv.id, patch: { status: v ?? inv.status } })}
                    options={INVOICE_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
                    allowClear={false}
                  />
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize">{inv.status}</span>
                )}
                {canManage && <button className="rounded-md p-1.5 hover:bg-muted text-destructive" onClick={() => setConfirmDelete(inv)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <InvoiceDrawer open={open} onOpenChange={setOpen} defaultType={kind} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete invoice?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try { await del.mutateAsync(confirmDelete.id); toast.success("Invoice deleted"); }
          catch (e) { toast.error((e as Error).message); }
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function InvoiceDrawer({ open, onOpenChange, defaultType }: { open: boolean; onOpenChange: (v: boolean) => void; defaultType: "receivable" | "payable" | null }) {
  const create = useCreateInvoice();
  const { data: owners = [] } = useOwners();
  const { data: properties = [] } = useProperties({ status: "all" });
  const { data: team = [] } = useTeamMembers();
  const [type, setType] = useState<string>(defaultType ?? "receivable");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) setType(defaultType ?? "receivable");
  }, [open, defaultType]);

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel="New invoice">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">New Invoice</h3>
        <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <form
        className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 content-start"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!amount) return toast.error("Amount is required");
          try {
            await create.mutateAsync({
              invoice: {
                type, owner_id: ownerId, property_id: propertyId, agent_id: agentId,
                amount: Number(amount), due_date: dueDate || null, notes: notes || null, status: "draft",
              },
            });
            toast.success("Invoice created");
            onOpenChange(false);
          } catch (err) { toast.error((err as Error).message); }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</span>
          <SelectField value={type} onChange={(v) => setType(v ?? "receivable")} options={INVOICE_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} allowClear={false} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Amount</span>
          <input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Owner / client</span>
          <SearchableSelectField value={ownerId} onChange={setOwnerId} options={owners.map((o) => ({ value: o.id, label: o.name }))} placeholder="Select owner" searchPlaceholder="Search..." />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Property</span>
          <SearchableSelectField value={propertyId} onChange={setPropertyId} options={properties.map((p) => ({ value: p.id, label: p.title }))} placeholder="Select property" searchPlaceholder="Search..." />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Agent</span>
          <SearchableSelectField value={agentId} onChange={setAgentId} options={team.map((m) => ({ value: m.id, label: m.full_name }))} placeholder="Select agent" searchPlaceholder="Search..." />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Due date</span>
          <input className={inputCls} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
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

function PaymentsTab({ canManage }: { canManage: boolean }) {
  const { data: payments = [] } = usePayments();
  const { data: invoices = [] } = useInvoices();
  const record = useRecordPayment();
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Record Payment</Button>
        </div>
      )}
      {payments.length === 0 ? (
        <EmptyState icon={<Wallet className="h-4 w-4" />} title="No payments recorded yet" />
      ) : (
        <div className="space-y-2">
          {payments.map((p: any) => (
            <Card key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium capitalize">{p.method ?? "Payment"} {p.invoices ? `· Invoice ${p.invoices.invoice_number ?? ""}` : ""}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(p.received_date)} · {p.status}</p>
              </div>
              <span className="text-sm font-medium">{fmtMoney(p.amount, p.currency)}</span>
            </Card>
          ))}
        </div>
      )}
      <DrawerShell open={open} onOpenChange={setOpen} ariaLabel="Record payment">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">Record Payment</h3>
          <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-3 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Invoice (optional)</span>
            <SearchableSelectField value={invoiceId} onChange={setInvoiceId} options={invoices.map((i: any) => ({ value: i.id, label: `${i.invoice_number ?? i.type} - ${fmtMoney(i.amount, i.currency)}` }))} placeholder="Select invoice" emptyLabel="None" searchPlaceholder="Search..." />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Amount</span>
            <input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Method</span>
            <SelectField value={method} onChange={(v) => setMethod(v ?? "bank_transfer")} options={["bank_transfer", "cash", "cheque", "card"].map((m) => ({ value: m, label: titleCase(m) }))} allowClear={false} />
          </label>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={record.isPending || !amount}
              onClick={async () => {
                try {
                  await record.mutateAsync({ invoice_id: invoiceId, amount: Number(amount), method, status: "received" });
                  toast.success("Payment recorded");
                  setOpen(false);
                  setAmount(""); setInvoiceId(null);
                } catch (e) { toast.error((e as Error).message); }
              }}
            >
              Record
            </Button>
          </div>
        </div>
      </DrawerShell>
    </div>
  );
}

function CommissionsTab() {
  const { data: transactions = [] } = useTransactions();
  const { data: team = [] } = useTeamMembers();
  const closed = transactions.filter((t) => t.status === "closed" && t.commission_value);

  const byAgent = team.map((m) => {
    const mine = closed.filter((t: any) => t.agent_id === m.id);
    return { id: m.id, name: m.full_name, total: mine.reduce((a, t) => a + (t.commission_value ?? 0), 0), count: mine.length };
  }).filter((r) => r.count > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-2">
      {byAgent.length === 0 ? (
        <EmptyState title="No commissions yet" />
      ) : (
        byAgent.map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 py-3">
            <p className="text-sm font-medium">{r.name}</p>
            <p className="text-sm">{fmtMoney(r.total, "QAR")} · {r.count} deal{r.count === 1 ? "" : "s"}</p>
          </Card>
        ))
      )}
    </div>
  );
}
