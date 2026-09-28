import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button, Card } from "./ui-primitives";
import { DrawerShell } from "./overlay";
import { SelectField } from "./select-field";
import { cn } from "@/lib/utils";
import {
  useFieldDefinitions,
  useCreateFieldDefinition,
  useUpdateFieldDefinition,
  useReorderFieldDefinitions,
  useDeleteFieldDefinition,
  uniqueFieldKey,
  type FieldEntityType,
} from "@/hooks/use-field-definitions";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  CUSTOM_FIELD_TYPES_WITH_OPTIONS,
  type CustomFieldType,
  type FormFieldDefinition,
} from "@/lib/db";

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelCls = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

/**
 * Settings > Form Inputs > Lead Inputs / Unit Inputs. Manages the custom
 * field definitions that render on Add/Edit Lead|Property and the
 * lead/property detail pages via <DynamicFieldsSection>/<DynamicFieldsView>.
 */
export function FieldDefinitionsManager({
  entityType,
  canManage,
}: {
  entityType: FieldEntityType;
  canManage: boolean;
}) {
  const { data: fields = [], isLoading } = useFieldDefinitions(entityType);
  const reorder = useReorderFieldDefinitions(entityType);
  const del = useDeleteFieldDefinition(entityType);
  const [editing, setEditing] = useState<FormFieldDefinition | null>(null);
  const [adding, setAdding] = useState(false);

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((f, i) => ({ id: f.id, display_order: i })));
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading fields...</p>;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="max-w-md text-xs text-muted-foreground">
          Fields configured here appear on {entityType === "lead" ? "Add/Edit Lead" : "Add/Edit Property"}{" "}
          and the {entityType === "lead" ? "lead profile" : "property detail page"}, wherever
          they're switched on below.
        </p>
        {canManage && (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add input
          </Button>
        )}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-16 px-3 py-2">Order</th>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Required</th>
              <th className="px-3 py-2">Filter</th>
              <th className="px-3 py-2">Export</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={i === 0 || !canManage}
                      onClick={() => move(i, -1)}
                      className="p-0.5 text-muted-foreground disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={i === fields.length - 1 || !canManage}
                      onClick={() => move(i, 1)}
                      className="p-0.5 text-muted-foreground disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button
                    className="text-left font-medium hover:underline disabled:cursor-default disabled:hover:no-underline"
                    disabled={!canManage}
                    onClick={() => canManage && setEditing(f)}
                  >
                    {f.label}
                  </button>
                  {f.is_system && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      <Lock className="h-2.5 w-2.5" /> System
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {CUSTOM_FIELD_TYPE_LABELS[f.field_type as CustomFieldType] ?? f.field_type}
                </td>
                <td className="px-3 py-2">{f.is_required ? "Yes" : "-"}</td>
                <td className="px-3 py-2">{f.is_filterable ? "Yes" : "-"}</td>
                <td className="px-3 py-2">{f.is_exportable ? "Yes" : "-"}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      f.is_active ? "bg-pastel-green" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {f.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {canManage && !f.is_system && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Delete "${f.label}"? Historical values are kept either way.`))
                          return;
                        try {
                          await del.mutateAsync(f);
                          toast.success("Field deleted");
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                      className="rounded-md p-1.5 text-destructive hover:bg-muted"
                      aria-label="Delete field"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No custom {entityType === "lead" ? "lead" : "unit"} inputs configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <FieldDefinitionDrawer
        entityType={entityType}
        open={adding || !!editing}
        def={editing}
        existing={fields}
        onOpenChange={(v) => {
          if (!v) {
            setAdding(false);
            setEditing(null);
          }
        }}
      />
    </div>
  );
}

function optionsToText(options: unknown): string {
  if (!Array.isArray(options)) return "";
  return options.filter((o): o is string => typeof o === "string").join("\n");
}

function textToOptions(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function FieldDefinitionDrawer({
  entityType,
  open,
  def,
  existing,
  onOpenChange,
}: {
  entityType: FieldEntityType;
  open: boolean;
  def: FormFieldDefinition | null;
  existing: FormFieldDefinition[];
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateFieldDefinition(entityType);
  const update = useUpdateFieldDefinition(entityType);
  const isEdit = !!def;

  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isFilterable, setIsFilterable] = useState(false);
  const [isExportable, setIsExportable] = useState(false);
  const [showOnCreate, setShowOnCreate] = useState(true);
  const [showOnEdit, setShowOnEdit] = useState(true);
  const [showOnDetail, setShowOnDetail] = useState(true);
  const [optionsText, setOptionsText] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(def?.label ?? "");
    setFieldType((def?.field_type as CustomFieldType) ?? "text");
    setIsRequired(def?.is_required ?? false);
    setIsActive(def?.is_active ?? true);
    setIsFilterable(def?.is_filterable ?? false);
    setIsExportable(def?.is_exportable ?? false);
    setShowOnCreate(def?.show_on_create ?? true);
    setShowOnEdit(def?.show_on_edit ?? true);
    setShowOnDetail(def?.show_on_detail ?? true);
    setOptionsText(optionsToText(def?.options));
  }, [open, def]);

  const pending = create.isPending || update.isPending;
  const needsOptions = CUSTOM_FIELD_TYPES_WITH_OPTIONS.includes(fieldType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Label is required");
      return;
    }
    const options = needsOptions ? textToOptions(optionsText) : null;
    if (needsOptions && (!options || options.length === 0)) {
      toast.error("Add at least one option");
      return;
    }
    try {
      if (isEdit && def) {
        await update.mutateAsync({
          id: def.id,
          patch: {
            label: trimmed,
            field_type: fieldType,
            is_required: isRequired,
            is_active: isActive,
            is_filterable: isFilterable,
            is_exportable: isExportable,
            show_on_create: showOnCreate,
            show_on_edit: showOnEdit,
            show_on_detail: showOnDetail,
            options,
          },
        });
        toast.success("Field updated");
      } else {
        await create.mutateAsync({
          key: uniqueFieldKey(trimmed, existing),
          label: trimmed,
          field_type: fieldType,
          is_required: isRequired,
          is_active: isActive,
          is_filterable: isFilterable,
          is_exportable: isExportable,
          show_on_create: showOnCreate,
          show_on_edit: showOnEdit,
          show_on_detail: showOnDetail,
          options,
          display_order: existing.length,
        });
        toast.success("Field added");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} ariaLabel={isEdit ? "Edit field" : "Add field"}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold">{isEdit ? "Edit Input" : "Add Input"}</h3>
        <button
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form className="flex-1 space-y-3 overflow-y-auto p-5" onSubmit={handleSubmit}>
        {def?.is_system && (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            This is a system field and cannot be deleted. Only display and visibility settings can
            be changed here.
          </p>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Label *</span>
          <input
            className={inputCls}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Preferred contact time"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Input type</span>
          <SelectField
            value={fieldType}
            onChange={(v) => setFieldType((v as CustomFieldType) ?? "text")}
            options={CUSTOM_FIELD_TYPES.map((t) => ({ value: t, label: CUSTOM_FIELD_TYPE_LABELS[t] }))}
            allowClear={false}
            disabled={isEdit} // changing the type of a field with saved values is intentionally not allowed
          />
          {isEdit && (
            <span className="text-[11px] text-muted-foreground">
              The input type can't be changed after values may have been saved. Deactivate this
              field and add a new one instead if you need a different type.
            </span>
          )}
        </label>
        {needsOptions && (
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>Options (one per line) *</span>
            <textarea
              className={cn(inputCls, "h-28 py-2")}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder={"Option A\nOption B\nOption C"}
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <ToggleRow label="Required" checked={isRequired} onChange={setIsRequired} />
          <ToggleRow label="Active" checked={isActive} onChange={setIsActive} />
          <ToggleRow label="Filterable" checked={isFilterable} onChange={setIsFilterable} />
          <ToggleRow label="Exportable" checked={isExportable} onChange={setIsExportable} />
        </div>

        <div className="border-t border-border pt-3">
          <p className={labelCls}>Where it appears</p>
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            <ToggleRow label="Add form" checked={showOnCreate} onChange={setShowOnCreate} />
            <ToggleRow label="Edit form" checked={showOnEdit} onChange={setShowOnEdit} />
            <ToggleRow
              label={entityType === "lead" ? "Lead profile" : "Property detail"}
              checked={showOnDetail}
              onChange={setShowOnDetail}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : isEdit ? "Save changes" : "Add input"}
          </Button>
        </div>
      </form>
    </DrawerShell>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
