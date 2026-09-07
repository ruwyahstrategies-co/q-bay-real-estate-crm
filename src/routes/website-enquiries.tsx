import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Inbox, FileCheck2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PermissionGate } from "@/components/permission-gate";
import { SelectField } from "@/components/select-field";
import { SubmissionDetailDrawer } from "@/components/submission-detail-drawer";
import { usePermissions } from "@/hooks/use-auth";
import { useWebsiteEnquiries, useAssignWebsiteEnquiry } from "@/hooks/use-website-enquiries";
import { useSubmissions } from "@/hooks/use-submissions";
import { useOwners } from "@/hooks/use-owners";
import { useTeamMembers } from "@/hooks/use-team";
import { fmtDateTime, fmtMoney, type PropertySubmission } from "@/lib/db";
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
        <PageHeader
          eyebrow="Website"
          title="Website Enquiries"
          description="Public enquiries and list-your-property submissions from the future website."
        />
        <div className="mb-4 flex gap-1 rounded-lg border border-border bg-canvas p-1 w-fit">
          <button
            onClick={() => setTab("enquiries")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              tab === "enquiries" ? "bg-muted" : "text-muted-foreground",
            )}
          >
            Enquiries
          </button>
          {can("submissions", "view") && (
            <button
              onClick={() => setTab("submissions")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                tab === "submissions" ? "bg-muted" : "text-muted-foreground",
              )}
            >
              Listing Submissions
            </button>
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
      empty={
        <EmptyState
          icon={<Inbox className="h-4 w-4" />}
          title="No website enquiries yet"
          description="Enquiries submitted from the public website will appear here."
        />
      }
    >
      {enquiries.map((e) => (
        <tr key={e.id} className="border-b border-border last:border-0 hover:bg-background/60">
          <td className="px-4 py-3 text-xs">{fmtDateTime(e.created_at)}</td>
          <td className="px-4 py-3 text-sm font-medium">{e.name}</td>
          <td className="px-4 py-3 text-xs">{e.phone ?? e.email ?? "-"}</td>
          <td className="px-4 py-3 text-xs">
            {e.property_id ? (
              <Link
                to="/properties/$propertyId"
                params={{ propertyId: e.property_id }}
                className="hover:underline"
              >
                {(e as any).properties?.title ?? "Property"}
              </Link>
            ) : (
              "-"
            )}
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
  const { data: owners = [] } = useOwners();
  const { can } = usePermissions();
  const canReview = can("submissions", "review");
  const [active, setActive] = useState<PropertySubmission | null>(null);

  const ownerName = (id: string | null) => owners.find((o) => o.id === id)?.name;

  return (
    <>
      <DataTable
        columns={[
          "Submitted",
          "Contact",
          "Owner",
          "Type",
          "Location",
          "Price",
          "Source",
          "Status",
          "",
        ]}
        empty={
          <EmptyState
            icon={<FileCheck2 className="h-4 w-4" />}
            title="No listing submissions yet"
            description="Property owners submitting from List Your Property on the public website will appear here."
          />
        }
      >
        {submissions.map((s) => (
          <tr key={s.id} className="border-b border-border last:border-0 hover:bg-background/60">
            <td className="px-4 py-3 text-xs">{fmtDateTime(s.created_at)}</td>
            <td className="px-4 py-3 text-sm font-medium">
              {s.full_name ?? "-"}
              <div className="text-xs text-muted-foreground">{s.phone ?? s.email ?? ""}</div>
            </td>
            <td className="px-4 py-3 text-xs">
              {s.owner_id ? (
                <Link
                  to="/owners/$ownerId"
                  params={{ ownerId: s.owner_id }}
                  className="hover:underline"
                >
                  {ownerName(s.owner_id) ?? "View owner"}
                </Link>
              ) : (
                "-"
              )}
            </td>
            <td className="px-4 py-3 text-xs">{s.property_type ?? "-"}</td>
            <td className="px-4 py-3 text-xs">{s.location ?? "-"}</td>
            <td className="px-4 py-3 text-xs">{fmtMoney(s.price, s.currency)}</td>
            <td className="px-4 py-3 text-xs capitalize">{s.source ?? "website"}</td>
            <td className="px-4 py-3 text-xs capitalize">{s.status.replace(/_/g, " ")}</td>
            <td className="px-4 py-3 text-right">
              <button
                className="rounded-md px-2 py-1 text-[11px] font-medium hover:bg-muted border border-border"
                onClick={() => setActive(s)}
              >
                {canReview ? "Review" : "View"}
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
      <SubmissionDetailDrawer
        submission={active}
        open={!!active}
        onOpenChange={(v) => !v && setActive(null)}
        canReview={canReview}
      />
    </>
  );
}
