import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounced } from "@/hooks/use-debounced";
import { useLeadBrief, useLeadPicker } from "@/hooks/use-lead-picker";
import { cn, titleCase } from "@/lib/utils";

/**
 * Choose one lead. Search runs in the database (name, phone, email) and shows the best matches only, so it
 * stays fast however many leads there are. People see only the leads their access allows.
 */
export function LeadSearchSelect({
  value,
  onChange,
  allowClear = true,
  disabled,
  placeholder = "Search and select a lead",
  className,
}: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  allowClear?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);
  const { data: leads = [], isLoading, isFetching } = useLeadPicker(debounced, { enabled: open });
  const { data: selected } = useLeadBrief(value);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-canvas px-3 text-left text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value ? (selected?.full_name ?? "Selected lead") : placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[260px] p-2" align="start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder="Search name, phone or email..."
            aria-label="Search leads"
            className="h-9 w-full rounded-lg border border-border bg-canvas pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <ul className={cn("mt-2 max-h-60 space-y-0.5 overflow-y-auto", isFetching && "opacity-70")} aria-busy={isFetching}>
          {isLoading ? (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">Searching...</li>
          ) : leads.length === 0 ? (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">No leads match.</li>
          ) : (
            leads.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(l.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    l.id === value && "bg-qbay-tint",
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", l.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate font-medium">{l.full_name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{titleCase(l.pipeline_stage)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        {leads.length >= 15 && (
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">Showing the best matches. Keep typing to narrow down.</p>
        )}
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
