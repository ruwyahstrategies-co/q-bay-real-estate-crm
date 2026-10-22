import { useEffect, useRef, useState } from "react";
import {
  FileDown,
  FileSignature,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/db";
import { qatarDayKey } from "@/lib/qatar-time";
import {
  EMPTY_OFFER_FORM_VALUES,
  OFFER_FORM_LABELS,
  finalizeOfferFormValues,
  offerFormFilename,
  prefillOfferForm,
  validateOfferForm,
  type OfferFormType,
  type OfferFormValues,
} from "@/lib/offer-forms";
import {
  useAttachSignedForm,
  useDeleteOfferForm,
  useOfferFormContext,
  useOfferForms,
  useSaveGeneratedForm,
  type OfferFormRecord,
} from "@/hooks/use-offer-forms";
import { downloadUpload, useUploads } from "@/hooks/use-uploads";
import { usePermissions } from "@/hooks/use-auth";
import type { Offer } from "@/hooks/use-offers";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/20";

function Field({
  label,
  hint,
  error,
  children,
  full,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

type OfferRef = Pick<
  Offer,
  "id" | "lead_id" | "property_id" | "development_id" | "amount" | "currency" | "offer_date"
>;

/**
 * Fills the original Booking Form or Reservation Form from the CRM, lets staff complete what the CRM does not
 * hold (ID number, commission, reserved amount), then generates the A4 PDF, downloads it and saves it to the offer.
 */
export function OfferFormDrawer({
  open,
  onOpenChange,
  offer,
  type,
  savedValues,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offer: OfferRef;
  type: OfferFormType;
  /** When regenerating, the values printed last time. */
  savedValues?: OfferFormValues | null;
}) {
  const { data: ctx, isLoading, isError, error: ctxError } = useOfferFormContext(offer, open);
  const save = useSaveGeneratedForm();
  const [values, setValues] = useState<OfferFormValues>(EMPTY_OFFER_FORM_VALUES);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | "preview" | "save">(null);
  const seeded = useRef<string | null>(null);

  // Seed the form once per opening, as soon as the CRM details have loaded.
  useEffect(() => {
    if (!open) {
      seeded.current = null;
      setTouched(false);
      return;
    }
    if (!ctx || seeded.current === `${offer.id}:${type}`) return;
    seeded.current = `${offer.id}:${type}`;
    setValues(
      savedValues ??
        prefillOfferForm({
          offer,
          lead: ctx.lead,
          property: ctx.property,
          development: ctx.development,
          areaName: ctx.areaName,
          placeName: ctx.placeName,
          today: qatarDayKey(Date.now()),
        }),
    );
  }, [open, ctx, offer, type, savedValues]);

  const set = (k: keyof OfferFormValues, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const issues = touched ? validateOfferForm(type, values) : [];
  const errorFor = (k: keyof OfferFormValues) => issues.find((i) => i.field === k)?.message;
  const label = OFFER_FORM_LABELS[type];

  async function run(mode: "preview" | "save") {
    setTouched(true);
    const problems = validateOfferForm(type, values);
    if (problems.length) {
      toast.error(problems[0].message);
      return;
    }
    setBusy(mode);
    try {
      const final = finalizeOfferFormValues(values);
      // The PDF library is only loaded when a form is actually generated.
      const pdf = await import("@/lib/offer-forms-pdf");
      const bytes = await pdf.buildOfferFormPdf(type, final, {
        templateBytes: await pdf.fetchOfferFormTemplate(type),
        renderText: pdf.renderTextWithCanvas,
      });
      const filename = offerFormFilename(type, final);
      if (mode === "preview") {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      // The staff member always gets the file first; saving it to the offer comes second.
      pdf.downloadPdfBytes(bytes, filename);
      try {
        await save.mutateAsync({
          offer,
          type,
          values: final,
          pdf: new File([bytes as BlobPart], filename, { type: "application/pdf" }),
        });
        toast.success(`${label} downloaded and saved to the offer`);
        onOpenChange(false);
      } catch (e) {
        toast.error(
          `${label} was downloaded, but could not be saved to the offer: ${(e as Error).message}`,
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <DrawerShell
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel={label}
      widthClassName="max-w-2xl"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold">{label}</h3>
          <p className="text-xs text-muted-foreground">
            Filled into the original Q Bay form. Check every value, then generate the PDF.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading client and property details...
          </p>
        )}
        {isError && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Could not load the CRM details for this offer ({(ctxError as Error)?.message}). You can
            still fill the form by hand.
          </p>
        )}
        {ctx && !ctx.property && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            This offer is not linked to a property, so the unit details start blank. Enter them
            below.
          </p>
        )}

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Client information</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client name" error={errorFor("client_name")}>
              <input
                className={inputCls}
                value={values.client_name}
                onChange={(e) => set("client_name", e.target.value)}
              />
            </Field>
            <Field label="Mobile number">
              <input
                className={inputCls}
                value={values.client_mobile}
                onChange={(e) => set("client_mobile", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputCls}
                value={values.client_email}
                onChange={(e) => set("client_email", e.target.value)}
              />
            </Field>
            <Field label="ID number" hint="Not held in the CRM. Enter it from the client's ID.">
              <input
                className={inputCls}
                value={values.client_id_number}
                onChange={(e) => set("client_id_number", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">
            {type === "booking" ? "Project details" : "Apartment details"}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Location" full>
              <input
                className={inputCls}
                value={values.location}
                onChange={(e) => set("location", e.target.value)}
              />
            </Field>
            <Field label="Tower name">
              <input
                className={inputCls}
                value={values.tower_name}
                onChange={(e) => set("tower_name", e.target.value)}
              />
            </Field>
            <Field label="Floor">
              <input
                className={inputCls}
                value={values.floor}
                onChange={(e) => set("floor", e.target.value)}
              />
            </Field>
            <Field label="Unit no.">
              <input
                className={inputCls}
                value={values.unit_no}
                onChange={(e) => set("unit_no", e.target.value)}
              />
            </Field>
            <Field label="Bed rooms">
              <input
                className={inputCls}
                value={values.bedrooms}
                onChange={(e) => set("bedrooms", e.target.value)}
              />
            </Field>
            <Field label="Size">
              <input
                className={inputCls}
                value={values.size}
                onChange={(e) => set("size", e.target.value)}
              />
            </Field>
            <Field label="Price" hint="A plain number prints as QAR.">
              <input
                className={inputCls}
                value={values.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Agreement</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" error={errorFor("form_date")}>
              <input
                type="date"
                className={inputCls}
                value={values.form_date}
                onChange={(e) => set("form_date", e.target.value)}
              />
            </Field>
            {type === "booking" ? (
              <Field
                label="Office commission (%)"
                hint="Printed in the commission sentence. Leave empty to write it by hand."
                error={errorFor("commission_percent")}
              >
                <input
                  inputMode="decimal"
                  className={inputCls}
                  placeholder="e.g. 2.5"
                  value={values.commission_percent}
                  onChange={(e) => set("commission_percent", e.target.value)}
                />
              </Field>
            ) : (
              <Field
                label="Reserved amount"
                hint="Printed in the Arabic and English sentence. Leave empty to write it by hand."
              >
                <input
                  inputMode="decimal"
                  className={inputCls}
                  placeholder="e.g. 25000"
                  value={values.reservation_amount}
                  onChange={(e) => set("reservation_amount", e.target.value)}
                />
              </Field>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-canvas px-5 py-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>
          Cancel
        </Button>
        <Button variant="outline" onClick={() => run("preview")} disabled={!!busy || isLoading}>
          {busy === "preview" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          Preview / print
        </Button>
        <Button onClick={() => run("save")} disabled={!!busy || isLoading}>
          {busy === "save" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          Generate and download
        </Button>
      </div>
    </DrawerShell>
  );
}

function savedValuesOf(form: OfferFormRecord): OfferFormValues {
  return { ...EMPTY_OFFER_FORM_VALUES, ...(form.form_data as Partial<OfferFormValues>) };
}

/**
 * The booking / reservation workflow for one offer: generate each form, download it, and upload the signed
 * copy back. Generated and signed files are kept with the offer in private storage.
 */
export function OfferFormsPanel({ offer }: { offer: OfferRef }) {
  const { can } = usePermissions();
  const canGenerate = can("offers", "edit") || can("offers", "create");
  const canUpload = can("uploads", "upload");
  const canDelete = can("offers", "delete");
  const { data: forms = [] } = useOfferForms(offer.id);
  const { data: files = [] } = useUploads({ offerId: offer.id });
  const attach = useAttachSignedForm();
  const remove = useDeleteOfferForm();
  const [drawer, setDrawer] = useState<{
    type: OfferFormType;
    saved: OfferFormValues | null;
  } | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingForm = useRef<OfferFormRecord | null>(null);
  const fileById = new Map(files.map((f) => [f.id, f]));

  async function onSignedChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const form = pendingForm.current;
    e.target.value = "";
    if (!file || !form) return;
    setSigningId(form.id);
    try {
      await attach.mutateAsync({ form, file });
      toast.success("Signed copy uploaded to the offer");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSigningId(null);
      pendingForm.current = null;
    }
  }

  const download = (id: string | null) => {
    const f = id ? fileById.get(id) : undefined;
    if (!f) return toast.error("That file is no longer available.");
    downloadUpload(f).catch((e) => toast.error((e as Error).message));
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Booking and reservation forms
      </p>

      {canGenerate && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrawer({ type: "booking", saved: null })}
          >
            <FileSignature className="h-3.5 w-3.5" /> Generate Booking Form
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrawer({ type: "reservation", saved: null })}
          >
            <FileSignature className="h-3.5 w-3.5" /> Generate Reservation Form
          </Button>
        </div>
      )}

      {forms.length === 0 ? (
        <p className="text-xs text-muted-foreground">No forms generated for this offer yet.</p>
      ) : (
        <ul className="space-y-2">
          {forms.map((f) => {
            const vals = savedValuesOf(f);
            const type = f.form_type as OfferFormType;
            return (
              <li
                key={f.id}
                className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {OFFER_FORM_LABELS[type] ?? f.form_type}
                      <span
                        className={cn(
                          "ml-2 rounded-full px-2 py-0.5 text-[11px] font-normal",
                          f.status === "signed"
                            ? "bg-pastel-green"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {f.status === "signed" ? "Signed copy uploaded" : "Awaiting signature"}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-muted-foreground">
                      {vals.client_name || "Client"} · generated {fmtDateTime(f.generated_at)}
                      {f.signed_at ? ` · signed copy ${fmtDateTime(f.signed_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => download(f.generated_upload_id)}
                      disabled={!f.generated_upload_id}
                    >
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </Button>
                    {f.signed_upload_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => download(f.signed_upload_id)}
                      >
                        <FileDown className="h-3.5 w-3.5" /> Signed
                      </Button>
                    )}
                    {canUpload && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={signingId === f.id}
                        onClick={() => {
                          pendingForm.current = f;
                          fileInput.current?.click();
                        }}
                      >
                        {signingId === f.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {f.signed_upload_id ? "Replace signed copy" : "Upload signed copy"}
                      </Button>
                    )}
                    {canGenerate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDrawer({ type, saved: vals })}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                      </Button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Delete form record"
                        onClick={async () => {
                          try {
                            await remove.mutateAsync(f);
                            toast.success(
                              "Form record removed. The PDF files stay in the offer attachments.",
                            );
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
        onChange={onSignedChosen}
      />

      {drawer && (
        <OfferFormDrawer
          open
          onOpenChange={(v) => !v && setDrawer(null)}
          offer={offer}
          type={drawer.type}
          savedValues={drawer.saved}
        />
      )}
    </div>
  );
}
