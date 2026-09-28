import { Fragment } from "react";
import { Card } from "./ui-primitives";
import { SelectField } from "./select-field";
import { cn } from "@/lib/utils";
import { useFieldDefinitions, type FieldEntityType } from "@/hooks/use-field-definitions";
import type { FormFieldDefinition } from "@/lib/db";
import type { Json } from "@/integrations/supabase/types";

/** The shape leads.custom_fields / properties.custom_fields are read and written as. Every
 * value a form can produce (string, number, boolean, string[], null) is a valid Json member. */
export type CustomFieldValues = Record<string, Json>;

const labelCls = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function optionsOf(def: FormFieldDefinition): string[] {
  const raw = def.options;
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is string => typeof o === "string");
}

/** Definitions relevant to a form context, active only, in configured order. */
function useVisibleDefinitions(
  entityType: FieldEntityType,
  mode: "create" | "edit" | "detail",
): FormFieldDefinition[] {
  const { data = [] } = useFieldDefinitions(entityType, { activeOnly: true });
  const key = mode === "create" ? "show_on_create" : mode === "edit" ? "show_on_edit" : "show_on_detail";
  return data.filter((d) => d[key]);
}

/**
 * The first missing required custom field's label, or null if the record is
 * valid. Call before submit in Add/Edit Lead and Add/Edit Property.
 */
export function firstMissingRequiredField(
  defs: FormFieldDefinition[],
  values: CustomFieldValues,
): string | null {
  for (const def of defs) {
    if (!def.is_required) continue;
    // Yes/No fields default to false, which is a valid, non-missing answer.
    if (def.field_type === "boolean" || def.field_type === "checkbox") continue;
    const v = values[def.key];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) return def.label;
  }
  return null;
}

/**
 * The label of the first required-but-empty custom field for this form
 * context, or null if everything required is filled in. Call at submit time
 * alongside the form's own native-field validation.
 */
export function useRequiredCustomFieldError(
  entityType: FieldEntityType,
  mode: "create" | "edit",
  values: CustomFieldValues,
): string | null {
  const defs = useVisibleDefinitions(entityType, mode);
  return firstMissingRequiredField(defs, values);
}

/**
 * Renders one input per active custom field configured to appear on this
 * form (create or edit). Values live in a single jsonb blob on the record -
 * `values`/`onChange` work the same way the rest of the form's state does.
 * Renders nothing (not even a heading) when no custom fields are configured.
 */
export function DynamicFieldsSection({
  entityType,
  mode,
  values,
  onChange,
}: {
  entityType: FieldEntityType;
  mode: "create" | "edit";
  values: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
}) {
  const defs = useVisibleDefinitions(entityType, mode);
  if (defs.length === 0) return null;

  function set(key: string, v: Json) {
    onChange({ ...values, [key]: v });
  }

  return (
    <>
      <div className="sm:col-span-2 mt-1 border-t border-border pt-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {entityType === "lead" ? "Additional lead details" : "Additional unit details"}
        </p>
      </div>
      {defs.map((def) => (
        <label key={def.id} className="flex flex-col gap-1.5">
          <span className={labelCls}>
            {def.label}
            {def.is_required ? " *" : ""}
          </span>
          <CustomFieldInput
            def={def}
            value={values[def.key]}
            onChange={(v) => set(def.key, v)}
          />
        </label>
      ))}
    </>
  );
}

function CustomFieldInput({
  def,
  value,
  onChange,
}: {
  def: FormFieldDefinition;
  value: Json | undefined;
  onChange: (v: Json) => void;
}) {
  switch (def.field_type) {
    case "textarea":
      return (
        <textarea
          className={cn(inputCls, "h-20 py-2")}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={def.is_required}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className={inputCls}
          value={typeof value === "number" ? value : (value as string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          required={def.is_required}
        />
      );
    case "phone":
      return (
        <input
          type="tel"
          className={inputCls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={def.is_required}
        />
      );
    case "email":
      return (
        <input
          type="email"
          className={inputCls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={def.is_required}
        />
      );
    case "date":
      return (
        <input
          type="date"
          className={inputCls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={def.is_required}
        />
      );
    case "boolean":
    case "checkbox":
      return (
        <label className="flex h-9 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          Yes
        </label>
      );
    case "select":
      return (
        <SelectField
          value={typeof value === "string" ? value : null}
          onChange={(v) => onChange(v)}
          options={optionsOf(def).map((o) => ({ value: o, label: o }))}
          placeholder={`Select ${def.label.toLowerCase()}`}
        />
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const options = optionsOf(def);
      return (
        <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-canvas p-2">
          {options.length === 0 ? (
            <p className="px-1 py-1 text-xs text-muted-foreground">No options configured.</p>
          ) : (
            options.map((o) => (
              <label
                key={o}
                className="flex items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...selected, o] : selected.filter((s) => s !== o),
                    )
                  }
                />
                {o}
              </label>
            ))
          )}
        </div>
      );
    }
    case "text":
    default:
      return (
        <input
          className={inputCls}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          required={def.is_required}
        />
      );
  }
}

function displayValue(def: FormFieldDefinition, raw: unknown): string {
  if (raw == null || raw === "") return "-";
  if (def.field_type === "boolean" || def.field_type === "checkbox") return raw ? "Yes" : "No";
  if (def.field_type === "multiselect" && Array.isArray(raw)) return raw.join(", ") || "-";
  if (def.field_type === "date" && typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime())
      ? raw
      : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  return String(raw);
}

/**
 * Read-only display of an entity's custom field values, for Lead Profile /
 * Property detail pages. Self-contained (renders its own Card) and renders
 * nothing at all when there are no active fields configured to show here.
 */
export function DynamicFieldsView({
  entityType,
  values,
}: {
  entityType: FieldEntityType;
  values: CustomFieldValues | null | undefined;
}) {
  const defs = useVisibleDefinitions(entityType, "detail");
  if (defs.length === 0) return null;
  const v = values ?? {};
  return (
    <Card className="md:col-span-2">
      <h4 className="text-sm font-semibold">
        {entityType === "lead" ? "Additional lead details" : "Additional unit details"}
      </h4>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {defs.map((def) => (
          <Fragment key={def.id}>
            <dt className="text-muted-foreground">{def.label}</dt>
            <dd>{displayValue(def, v[def.key])}</dd>
          </Fragment>
        ))}
      </dl>
    </Card>
  );
}
