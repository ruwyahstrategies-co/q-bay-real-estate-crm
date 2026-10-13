import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-primitives";
import { cn } from "@/lib/utils";
import { useMasterData, useCreateMasterValue, useUpdateMasterValue } from "@/hooks/use-master-data";
import { MASTER_KIND_LABELS, type MasterKind } from "@/lib/master-data";
import type { MasterDataValue } from "@/lib/db";

const inputCls =
  "h-9 rounded-lg border border-border bg-canvas px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const KINDS: MasterKind[] = ["developer", "company"];

const HELP: Record<MasterKind, string> = {
  developer:
    "Approved developers. Staff pick from this list on Developments and Properties; they cannot type a new one. Deactivating a developer keeps it on records that already use it and stops it being offered for new ones.",
  company:
    "Approved companies. Staff pick from this list on Owners; they cannot type a new one. Deactivating a company keeps it on owners that already use it and stops it being offered for new ones.",
};

/**
 * Settings > Developers & Companies. The only place these lists change. Everyone with Settings
 * access can read them; adding, renaming and deactivating needs settings.manage (the database
 * enforces that too, so hiding the controls here is a convenience, not the protection).
 */
export function MasterDataManager({ canManage }: { canManage: boolean }) {
  const [kind, setKind] = useState<MasterKind>("developer");

  return (
    <div className="mt-4 space-y-4">
      <div
        role="tablist"
        aria-label="Master data list"
        className="inline-flex rounded-xl border border-border bg-muted/60 p-1"
      >
        {KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm transition-colors",
              kind === k
                ? "bg-canvas font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {MASTER_KIND_LABELS[k].plural}
          </button>
        ))}
      </div>
      <MasterDataList key={kind} kind={kind} canManage={canManage} />
    </div>
  );
}

function MasterDataList({ kind, canManage }: { kind: MasterKind; canManage: boolean }) {
  const labels = MASTER_KIND_LABELS[kind];
  const { data: values = [], isLoading } = useMasterData(kind);
  const create = useCreateMasterValue(kind);
  const update = useUpdateMasterValue(kind);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return values.filter(
      (v) => (showInactive || v.is_active) && (!q || v.name.toLowerCase().includes(q)),
    );
  }, [values, query, showInactive]);

  const activeCount = values.filter((v) => v.is_active).length;

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync(name);
      setNewName("");
      toast.success(`${labels.singular} added`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading {labels.plural.toLowerCase()}...</p>;

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-xs text-muted-foreground">{HELP[kind]}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${labels.plural.toLowerCase()}...`}
            aria-label={`Search ${labels.plural.toLowerCase()}`}
            className={cn(inputCls, "w-full pl-8")}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--qbay-green)]"
          />
          Show inactive
        </label>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {activeCount} active of {values.length}
      </p>

      <div className="space-y-2">
        {visible.map((v) => (
          <MasterDataRow
            key={v.id}
            value={v}
            canManage={canManage}
            onRename={async (name) => {
              try {
                await update.mutateAsync({ id: v.id, patch: { name } });
                toast.success(`${labels.singular} renamed`);
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
            onToggleActive={async () => {
              try {
                await update.mutateAsync({ id: v.id, patch: { is_active: !v.is_active } });
                toast.success(v.is_active ? `${labels.singular} deactivated` : `${labels.singular} reactivated`);
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          />
        ))}
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {values.length === 0
              ? `No ${labels.plural.toLowerCase()} yet.`
              : `No ${labels.plural.toLowerCase()} match your search.`}
          </p>
        )}
      </div>

      {canManage ? (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`New ${labels.singular.toLowerCase()} name...`}
            aria-label={`New ${labels.singular.toLowerCase()} name`}
            className={cn(inputCls, "flex-1")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" size="sm" onClick={handleAdd} disabled={create.isPending || !newName.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add {labels.singular.toLowerCase()}
          </Button>
        </div>
      ) : (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Only administrators can add or change these values.
        </p>
      )}
    </div>
  );
}

function MasterDataRow({
  value,
  canManage,
  onRename,
  onToggleActive,
}: {
  value: MasterDataValue;
  canManage: boolean;
  onRename: (name: string) => void;
  onToggleActive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value.name);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2",
        !value.is_active && "opacity-60",
      )}
    >
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false);
            const next = name.trim();
            if (next && next !== value.name) onRename(next);
            else setName(value.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(value.name);
              setEditing(false);
            }
          }}
          aria-label={`Rename ${value.name}`}
          className="h-8 flex-1 rounded-md border border-border bg-canvas px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : canManage ? (
        <button
          type="button"
          className="flex-1 truncate text-left text-sm hover:underline"
          onClick={() => {
            setName(value.name);
            setEditing(true);
          }}
          title="Click to rename"
        >
          {value.name}
        </button>
      ) : (
        <span className="flex-1 truncate text-sm">{value.name}</span>
      )}

      {canManage ? (
        <button
          type="button"
          onClick={onToggleActive}
          aria-label={value.is_active ? `Deactivate ${value.name}` : `Reactivate ${value.name}`}
          title={value.is_active ? "Click to deactivate" : "Click to reactivate"}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            value.is_active ? "bg-pastel-green text-qbay-deep" : "bg-muted text-muted-foreground",
          )}
        >
          {value.is_active ? "Active" : "Inactive"}
        </button>
      ) : (
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            value.is_active ? "bg-pastel-green text-qbay-deep" : "bg-muted text-muted-foreground",
          )}
        >
          {value.is_active ? "Active" : "Inactive"}
        </span>
      )}
    </div>
  );
}
