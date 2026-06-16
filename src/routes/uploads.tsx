import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { UploadDropzone } from "@/components/upload-dropzone";
import { Card } from "@/components/ui-primitives";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/uploads")({
  head: () => ({ meta: [{ title: "Uploads" }] }),
  component: UploadsPage,
});

const categories = [
  {
    title: "Lead databases",
    description: "Import buyer contacts and lead lists.",
    accept: "CSV · XLSX",
  },
  {
    title: "WhatsApp exports",
    description: "Conversation history for context.",
    accept: "TXT · ZIP",
  },
  {
    title: "Property documents",
    description: "Listings, specs and supporting docs.",
    accept: "PDF · DOCX · TXT",
  },
  {
    title: "Property media",
    description: "Photos, renders and visuals.",
    accept: "JPG · PNG · WEBP",
  },
  {
    title: "Call recordings",
    description: "Voice recordings for review.",
    accept: "MP3 · WAV · M4A",
  },
  {
    title: "Brochures & floor plans",
    description: "Sales collateral and plans.",
    accept: "PDF · JPG · PNG",
  },
  {
    title: "General sales documents",
    description: "Contracts, offers, notes.",
    accept: "PDF · DOCX · CSV · TXT",
  },
];

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function UploadsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Data"
        title="Upload Centre"
        description="Send files into the platform. Processing will start once a backend is connected."
      />

      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Category
            </span>
            <select className={inputCls}>
              {categories.map((c) => (
                <option key={c.title}>{c.title}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Associate with lead
            </span>
            <select className={inputCls}>
              <option>None</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Associate with property
            </span>
            <select className={inputCls}>
              <option>None</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Assigned agent
            </span>
            <select className={inputCls}>
              <option>Unassigned</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((c) => (
          <UploadDropzone
            key={c.title}
            title={c.title}
            description={c.description}
            accept={c.accept}
          />
        ))}
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-[16px] font-semibold">Recent uploads</h3>
        <DataTable
          columns={[
            "File",
            "Category",
            "Lead / Property",
            "Uploaded by",
            "Uploaded",
            "Size",
            "Status",
            "Actions",
          ]}
          empty={
            <EmptyState
              compact
              icon={<Inbox className="h-4 w-4" />}
              title="No uploads yet"
              description="Files you upload will be listed here with their processing status."
            />
          }
        />
      </div>
    </AppShell>
  );
}
