import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { SelectField, SearchableSelectField, type SelectOption } from "@/components/select-field";
import { cn } from "@/lib/utils";

/**
 * Building blocks for list-page filters. Every control here is a real filter: the page owns the
 * state, passes it into its query hook, and puts it in the query key. Nothing in this file filters
 * anything by itself, so a control that is not wired to a field simply must not be rendered.
 */

export function FilterToolbar({
  children,
  className,
  ariaLabel = "Filters",
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-2.5 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterSearch({
  value,
  onChange,
  placeholder = "Search...",
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-[200px] flex-1", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="h-9 w-full rounded-lg border border-transparent bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:border-ring/40 focus:outline-none focus:ring-2 focus:ring-ring/20"
      />
    </div>
  );
}

/**
 * One structured filter. `allLabel` is what the unfiltered state reads as ("All developers"), so
 * the control always says which field it filters. A set filter is tinted so active filters are
 * visible at a glance. `searchable` swaps in the typeahead select for long lists.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  searchable,
  disabled,
  className,
}: {
  /** Field name, used for the accessible label. */
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  allLabel: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const active = !!value;
  const cls = cn("w-44", active && "border-qbay/40 bg-qbay-tint font-medium text-qbay", className);
  if (searchable) {
    return (
      <SearchableSelectField
        value={value}
        onChange={onChange}
        options={options}
        placeholder={allLabel}
        emptyLabel={allLabel}
        searchPlaceholder={`Search ${label.toLowerCase()}...`}
        disabled={disabled}
        className={cls}
      />
    );
  }
  return (
    <SelectField
      value={value}
      onChange={onChange}
      options={options}
      emptyLabel={allLabel}
      placeholder={allLabel}
      aria-label={label}
      disabled={disabled}
      className={cls}
    />
  );
}

/** Appears only while at least one filter is active. */
export function ClearFiltersButton({
  count,
  onClick,
  className,
}: {
  count: number;
  onClick: () => void;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      <X className="h-3.5 w-3.5" />
      Clear filters
      <span className="rounded-full bg-muted px-1.5 text-[10px] leading-4 tabular-nums">{count}</span>
    </button>
  );
}
