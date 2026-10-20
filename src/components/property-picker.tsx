import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounced } from "@/hooks/use-debounced";
import {
  PICKER_PAGE_SIZE,
  usePropertyBriefs,
  usePropertyPickerSearch,
  type PickerProperty,
} from "@/hooks/use-property-picker";
import { fmtMoney } from "@/lib/db";
import { cn } from "@/lib/utils";

// Property pickers that scale. Search runs in the database (reference, title, location, development, area),
// results come one page at a time, and nothing here ever loads the whole inventory into the browser.

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-canvas pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/20";

function subline(p: PickerProperty): string {
  return [p.development_name, p.area_name ?? p.location, p.price != null ? fmtMoney(p.price, p.currency) : null]
    .filter(Boolean)
    .join(" · ");
}

function PropertyRow({
  p,
  selected,
  multiple,
  onPick,
}: {
  p: PickerProperty;
  selected: boolean;
  multiple: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={multiple ? selected : undefined}
        aria-current={!multiple && selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          selected && "bg-qbay-tint",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border",
            multiple ? "rounded" : "rounded-full",
            selected ? "border-qbay bg-qbay text-white" : "border-border bg-canvas",
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {p.reference_code && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{p.reference_code}</span>}
            <span className="truncate font-medium">{p.title}</span>
          </span>
          {subline(p) && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{subline(p)}</span>}
        </span>
      </button>
    </li>
  );
}

/** Search box, one page of results, and paging controls. Shared by the single and multiple pickers. */
function PickerPanel({
  purpose,
  multiple,
  isSelected,
  onPick,
  autoFocus,
}: {
  purpose?: "sale" | "rent" | null;
  multiple: boolean;
  isSelected: (id: string) => boolean;
  onPick: (p: PickerProperty) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const debounced = useDebounced(query, 250);
  useEffect(() => setPage(0), [debounced]);

  const { data, isLoading, isError, isFetching } = usePropertyPickerSearch({ query: debounced, page, purpose });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * PICKER_PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PICKER_PAGE_SIZE);
  const lastPage = Math.max(0, Math.ceil(total / PICKER_PAGE_SIZE) - 1);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reference, title, development, area..."
          aria-label="Search properties"
          className={inputCls}
          onKeyDown={(e) => {
            // Enter must not submit the surrounding form.
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      </div>

      <div className={cn("mt-2 min-h-[120px]", isFetching && "opacity-70 transition-opacity")} aria-busy={isFetching}>
        {isLoading ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Searching...</p>
        ) : isError ? (
          <p className="px-2 py-6 text-center text-xs text-destructive">Could not load properties. Try again.</p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {debounced ? "No properties match this search." : "No properties available."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((p) => (
              <PropertyRow key={p.id} p={p} multiple={multiple} selected={isSelected(p.id)} onPick={() => onPick(p)} />
            ))}
          </ul>
        )}
      </div>

      {total > PICKER_PAGE_SIZE && (
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums" aria-live="polite">
            {from}-{to} of {total}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="rounded-md p-1 hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage}
              aria-label="Next page"
              className="rounded-md p-1 hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

function briefLabel(b: { reference_code: string | null; title: string } | undefined, fallback: string) {
  if (!b) return fallback;
  return b.reference_code ? `${b.reference_code} · ${b.title}` : b.title;
}

/** Choose one property. Used for viewings, tasks and anywhere a single property is required. */
export function PropertySearchSelect({
  value,
  onChange,
  purpose,
  placeholder = "Search and select a property",
  allowClear = false,
  disabled,
  className,
}: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  purpose?: "sale" | "rent" | null;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: briefs } = usePropertyBriefs(value ? [value] : []);
  const label = value ? briefLabel(briefs?.get(value), "Selected property") : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-canvas px-3 text-left text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
            !label && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{label ?? placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[300px] p-2" align="start">
        <PickerPanel
          autoFocus
          multiple={false}
          purpose={purpose}
          isSelected={(id) => id === value}
          onPick={(p) => {
            onChange(p.id);
            setOpen(false);
          }}
        />
        {allowClear && value && (
          <button
            type="button"
            className="mt-2 w-full rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Clear selection
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Choose any number of properties. Selections are kept while searching and paging, shown as removable chips
 * with a running count, and only the chosen ids are stored.
 */
export function PropertyMultiPicker({
  value,
  onChange,
  purpose,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  purpose?: "sale" | "rent" | null;
}) {
  const { data: briefs } = usePropertyBriefs(value);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="rounded-lg border border-border bg-canvas p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" aria-live="polite">
          {value.length} {value.length === 1 ? "property" : "properties"} selected
        </p>
        {value.length > 0 && (
          <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange([])}>
            Remove all
          </button>
        )}
      </div>

      {value.length > 0 && (
        <ul className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto" aria-label="Selected properties">
          {value.map((id) => (
            <li
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-qbay-tint py-0.5 pl-2.5 pr-1 text-[11px] text-qbay"
            >
              <span className="truncate">{briefLabel(briefs?.get(id), "Loading...")}</span>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label={`Remove ${briefs?.get(id)?.title ?? "property"}`}
                className="rounded-full p-0.5 hover:bg-qbay/15"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 border-t border-border pt-2.5">
        <PickerPanel multiple purpose={purpose} isSelected={(id) => value.includes(id)} onPick={(p) => toggle(p.id)} />
      </div>
    </div>
  );
}
