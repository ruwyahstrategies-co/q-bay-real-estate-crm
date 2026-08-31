import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Inbox, FileCheck2, Check, XIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField } from "@/components/select-field";
import { usePermissions, useCurrentUser } from "@/hooks/use-auth";
import { useWebsiteEnquiries, useAssignWebsiteEnquiry } from "@/hooks/use-website-enquiries";
import { useSubmissions, useReviewSubmission, useConvertSubmission } from "@/hooks/use-submissions";
import { useTeamMembers } from "@/hooks/use-team";
import { fmtDateTime, fmtMoney } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/website-enquiries")({
  head: () => ({ meta: [{ title: "Website Enquiries" }] }),
  component: WebsiteEnquiriesPage,
});

function WebsiteEnquiriesPage() {
  const [tab, setTab] = useState<"enquiries" | "submissions">("enquiries");
  const { can } = usePermissions();

  return (
    <AppShell>
      <PermissionGate module="website_enquiries" action="view" page>
      <PageHeader eyebrow="Website" title="Website Enquiries" description="Public enquiries and list-your-property submissions from the future website." />
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-canvas p-1 w-fit">
        <button onClick={() => setTab("enquiries")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === "enquiries" ? "bg-muted" : "text-muted-foreground")}>Enquiries</button>
        {can("submissions", "view") && (
          <button onClick={() => setTab("submissions")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", tab === "submissions" ? "bg-muted" : "text-muted-foreground")}>Listing Submissions</button>
        )}
      </div>
      {tab === "enquiries" ? <EnquiriesTab /> : <SubmissionsTab />}
      </PermissionGate>
    </AppShell>
  );
}

function EnquiriesTab() {
  const { data: enquiries = [] } = useWebsiteEnquiries();
  const { data: team = [] } = useTeamMembers();
  const assign = useAssignWebsiteEnquiry();
  const { can } = usePermissions();
  const canAssign = can("website_enquiries", "assign");

  return (
    <DataTable
      columns={["Received", "Name", "Contact", "Property", "Message", "Assigned agent"]}
      empty={<EmptyState icon={<Inbox className="h-4 w-4" />} title="No website enquiries yet" description="Enquiries submitted from the public website will appear here." />}
    >
      {enquiries.map((e) => (
        <tr key={e.id} className="border-b border-border last:border-0 hover:bg-background/60">
          <td className="px-4 py-3 text-xs">{fmtDateTime(e.created_at)}</td>
          <td className="px-4 py-3 text-sm font-medium">{e.name}</td>
          <td className="px-4 py-3 text-xs">{e.phone ?? e.email ?? "-"}</td>
          <td className="px-4 py-3 text-xs">
            {e.property_id ? <Link to="/properties/$propertyId" params={{ propertyId: e.property_id }} className="hover:underline">{(e as any).properties?.title ?? "Property"}</Link> : "-"}
          </td>
          <td className="max-w-xs px-4 py-3 text-xs truncate">{e.message ?? "-"}</td>
          <td className="px-4 py-3 text-xs">
            <SelectField
              className="h-7 w-40 text-xs"
              disabled={!canAssign}
              value={e.assigned_agent_id}
              onChange={(v) => assign.mutate({ id: e.id, assigned_agent_id: v ?? "" })}
              options={team.map((m) => ({ value: m.id, label: m.full_name }))}
              emptyLabel="Unassigned"
            />
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

function SubmissionsTab() {
  const { data: submissions = [] } = useSubmissions();
  const review = useReviewSubmission();
  const convert = useConvertSubmission();
  const { teamMember } = useCurrentUser();
  const { can } = usePermissions();
  const canReview = can("submissions", "review");

  return (
    <DataTable
      columns={["Submitted", "Contact", "Type", "Location", "Price", "Status", "Actions"]}
      empty={<EmptyState icon={<FileCheck2 className="h-4 w-4" />} title="No listing submissions yet" description="Property owners can submit listings for review from the future public website." />}
    >
      {submissions.map((s) => (
        <tr key={s.id} className="border-b border-border last:border-0 hover:bg-background/60">
          <td className="px-4 py-3 text-xs">{fmtDateTime(s.created_at)}</td>
          <td className="px-4 py-3 text-sm font-medium">{s.full_name ?? "-"}<div className="text-xs text-muted-foreground">{s.phone ?? s.email ?? ""}</div></td>
          <td className="px-4 py-3 text-xs">{s.property_type ?? "-"}</td>
          <td className="px-4 py-3 text-xs">{s.location ?? "-"}</td>
          <td className="px-4 py-3 text-xs">{fmtMoney(s.price, s.currency)}</td>
          <td className="px-4 py-3 text-xs capitalize">{s.status.replace(/_/g, " ")}</td>
          <td className="px-4 py-3">
            {canReview && (
              <div className="flex items-center gap-1">
                {s.status !== "approved" && s.status !== "published" && (
                  <button
                    className="rounded-md p-1.5 hover:bg-muted"
                    title="Approve"
                    onClick={async () => {
                      try { await review.mutateAsync({ id: s.id, status: "approved", reviewed_by: teamMember?.id ?? "" }); toast.success("Submission approved"); }
                      catch (e) { toast.error((e as Error).message); }
                    }}
                  ><Check className="h-3.5 w-3.5" /></button>
                )}
                {s.status === "approved" && (
                  <button
                    className="rounded-md px-2 py-1 text-[11px] hover:bg-muted border border-border"
                    onClick={async () => {
                      try { await convert.mutateAsync(s); toast.success("Converted to a property listing"); }
                      catch (e) { toast.error((e as Error).message); }
                    }}
                  >Convert to listing</button>
                )}
                {s.status !== "rejected" && (
                  <button
                    className="rounded-md p-1.5 hover:bg-muted text-destructive"
                    title="Reject"
                    onClick={async () => {
                      try { await review.mutateAsync({ id: s.id, status: "rejected", reviewed_by: teamMember?.id ?? "" }); toast.success("Submission rejected"); }
                      catch (e) { toast.error((e as Error).message); }
                    }}
                  ><XIcon className="h-3.5 w-3.5" /></button>
                )}
              </div>
            )}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
