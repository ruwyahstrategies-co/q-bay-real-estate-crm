import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { SelectOption } from "@/components/select-field";
import { cn } from "@/lib/utils";

/**
 * Pick any number of options from a searchable list. The trigger says what is chosen ("Agents: 2 selected"),
 * is tinted while a choice is active, and the list stays open so several options can be ticked in a row.
 */
export function MultiSelectField({
  label,
  values,
  onChange,
  options,
  allLabel,
  disabled,
  className,
}: {
  /** Field name, used for the accessible label and the summary ("Agents"). */
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  /** What the unfiltered state reads as ("All agents"). */
  allLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = values.length > 0;
  const summary =
    values.length === 0
      ? allLabel
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? `${label}: 1 selected`)
        : `${label}: ${values.length} selected`;

  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label} filter`}
          className={cn(
            "flex h-9 w-[calc(50%-0.25rem)] items-center justify-between gap-2 rounded-lg border border-border bg-canvas px-3 text-left text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50 sm:w-44",
            !active && "text-muted-foreground",
            active && "border-qbay/40 bg-qbay-tint font-medium text-qbay",
            className,
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
          <CommandList className="max-h-64">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const selected = values.includes(o.value);
                return (
                  <CommandItem key={o.value} value={o.label} disabled={o.disabled} onSelect={() => toggle(o.value)}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selected ? "border-qbay bg-qbay text-white" : "border-border",
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {active && (
          <button
            type="button"
            className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            onClick={() => onChange([])}
          >
            Clear {label.toLowerCase()}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
