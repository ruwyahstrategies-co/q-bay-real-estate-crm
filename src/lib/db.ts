import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const sb = supabase;

export type Tables = Database["public"]["Tables"];
export type Lead = Tables["leads"]["Row"];
export type LeadInsert = Tables["leads"]["Insert"];
export type LeadUpdate = Tables["leads"]["Update"];
export type Property = Tables["properties"]["Row"];
export type PropertyInsert = Tables["properties"]["Insert"];
export type PropertyUpdate = Tables["properties"]["Update"];
export type TeamMember = Tables["team_members"]["Row"];
export type TeamMemberInsert = Tables["team_members"]["Insert"];
export type Interaction = Tables["interactions"]["Row"];
export type InteractionInsert = Tables["interactions"]["Insert"];
export type Task = Tables["tasks"]["Row"];
export type TaskInsert = Tables["tasks"]["Insert"];
export type Upload = Tables["uploads"]["Row"];
export type UploadInsert = Tables["uploads"]["Insert"];
export type PipelineHistory = Tables["pipeline_history"]["Row"];
export type LeadPropertyInterest = Tables["lead_property_interests"]["Row"];
export type PropertyMedia = Tables["property_media"]["Row"];
export type PipelineStageRow = Tables["pipeline_stages"]["Row"];
export type PipelineStageInsert = Tables["pipeline_stages"]["Insert"];
export type PipelineStageUpdate = Tables["pipeline_stages"]["Update"];

export type Team = Tables["teams"]["Row"];
export type TeamInsert = Tables["teams"]["Insert"];
export type TeamUpdate = Tables["teams"]["Update"];
export type Country = Tables["countries"]["Row"];
export type CountryInsert = Tables["countries"]["Insert"];
export type Area = Tables["areas"]["Row"];
export type AreaInsert = Tables["areas"]["Insert"];
export type AreaUpdate = Tables["areas"]["Update"];
export type Owner = Tables["owners"]["Row"];
export type OwnerInsert = Tables["owners"]["Insert"];
export type OwnerUpdate = Tables["owners"]["Update"];
export type Development = Tables["developments"]["Row"];
export type DevelopmentInsert = Tables["developments"]["Insert"];
export type DevelopmentUpdate = Tables["developments"]["Update"];
export type Viewing = Tables["viewings"]["Row"];
export type ViewingInsert = Tables["viewings"]["Insert"];
export type ViewingUpdate = Tables["viewings"]["Update"];
export type AgentWhatsappConnection = Tables["agent_whatsapp_connections"]["Row"];
export type BlogPost = Tables["blog_posts"]["Row"];
export type BlogPostInsert = Tables["blog_posts"]["Insert"];
export type BlogPostUpdate = Tables["blog_posts"]["Update"];
export type WebsiteEnquiry = Tables["website_enquiries"]["Row"];
export type PropertySubmission = Tables["property_submissions"]["Row"];
export type PropertySubmissionUpdate = Tables["property_submissions"]["Update"];
export type TransactionRow = Tables["transactions"]["Row"];
export type TransactionInsert = Tables["transactions"]["Insert"];
export type TransactionUpdate = Tables["transactions"]["Update"];
export type StaffSession = Tables["staff_sessions"]["Row"];
export type StaffActivityEvent = Tables["staff_activity_events"]["Row"];
export type PropertyLease = Tables["property_leases"]["Row"];
export type PropertyLeaseInsert = Tables["property_leases"]["Insert"];

export const LEAD_CLASSIFICATIONS = ["buyer", "renter", "investor", "commercial"] as const;
export const LEAD_WORKFLOWS = ["sales", "telesales"] as const;
export const PROPERTY_PURPOSES = ["sale", "rent", "commercial"] as const;
export const VIEWING_STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const;
export const SUBMISSION_STATUSES = ["draft", "submitted", "under_review", "approved", "rejected", "published"] as const;
export const TRANSACTION_TYPES = ["sale", "rental", "commission_only"] as const;

export const PIPELINE_STAGES = [
  { key: "new_lead", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "property_matching", label: "Property Matching" },
  { key: "viewing_scheduled", label: "Viewing Scheduled" },
  { key: "negotiation", label: "Negotiation" },
  { key: "documentation", label: "Documentation" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["key"];

export function stageLabel(key: string): string {
  return PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key;
}

export const INTERACTION_TYPES = [
  "whatsapp",
  "phone_call",
  "email",
  "meeting",
  "website_enquiry",
  "walk_in",
  "manual_note",
] as const;

export const DIRECTIONS = ["inbound", "outbound", "internal"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;

export const UPLOAD_CATEGORIES = {
  lead_imports: {
    title: "Lead databases",
    bucket: "lead-imports",
    accept: ".csv,.xlsx",
    extensions: ["csv", "xlsx"],
    maxMb: 20,
  },
  whatsapp_exports: {
    title: "WhatsApp exports",
    bucket: "conversation-files",
    accept: ".txt,.zip",
    extensions: ["txt", "zip"],
    maxMb: 40,
  },
  property_documents: {
    title: "Property documents",
    bucket: "property-documents",
    accept: ".pdf,.docx,.txt",
    extensions: ["pdf", "docx", "txt"],
    maxMb: 40,
  },
  property_media: {
    title: "Property media",
    bucket: "property-media",
    accept: ".jpg,.jpeg,.png,.webp",
    extensions: ["jpg", "jpeg", "png", "webp"],
    maxMb: 20,
  },
  call_recordings: {
    title: "Call recordings",
    bucket: "call-recordings",
    accept: ".mp3,.wav,.m4a",
    extensions: ["mp3", "wav", "m4a"],
    maxMb: 150,
  },
  brochures: {
    title: "Brochures & floor plans",
    bucket: "property-documents",
    accept: ".pdf,.jpg,.jpeg,.png,.webp",
    extensions: ["pdf", "jpg", "jpeg", "png", "webp"],
    maxMb: 40,
  },
  general_documents: {
    title: "General sales documents",
    bucket: "general-documents",
    accept: ".pdf,.docx,.csv,.xlsx,.txt",
    extensions: ["pdf", "docx", "csv", "xlsx", "txt"],
    maxMb: 40,
  },
  development_media: {
    title: "Development media",
    bucket: "development-media",
    accept: ".jpg,.jpeg,.png,.webp",
    extensions: ["jpg", "jpeg", "png", "webp"],
    maxMb: 20,
  },
  development_documents: {
    title: "Development documents",
    bucket: "development-documents",
    accept: ".pdf,.docx",
    extensions: ["pdf", "docx"],
    maxMb: 40,
  },
  owner_documents: {
    title: "Owner documents",
    bucket: "owner-documents",
    accept: ".pdf,.docx",
    extensions: ["pdf", "docx"],
    maxMb: 40,
  },
  blog_images: {
    title: "Journal images",
    bucket: "blog-images",
    accept: ".jpg,.jpeg,.png,.webp",
    extensions: ["jpg", "jpeg", "png", "webp"],
    maxMb: 20,
  },
} as const;

export type UploadCategoryKey = keyof typeof UPLOAD_CATEGORIES;

export function fmtMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return "-";
  const cur = currency || "QAR";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${cur} ${amount.toLocaleString()}`;
  }
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtSize(bytes: number | null | undefined): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
