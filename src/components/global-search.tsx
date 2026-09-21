import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Loader2 } from "lucide-react";
import { DialogShell } from "@/components/overlay";
import { useGlobalSearch, type SearchResult, type SearchResultType } from "@/hooks/use-global-search";
import { cn } from "@/lib/utils";

const TYPE_ORDER: SearchResultType[] = ["Lead", "Property", "Owner", "Development", "Team member"];

const TYPE_TONE: Record<SearchResultType, string> = {
  Lead: "bg-pastel-blue",
  Property: "bg-pastel-green",
  Owner: "bg-pastel-cream",
  Development: "bg-pastel-indigo",
  "Team member": "bg-pastel-slate",
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Header search button plus the command-palette style dialog. Ctrl/Cmd+K opens it from anywhere. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(q, 250);
  const { data = [], isFetching } = useGlobalSearch(debounced, open);
  const settled = debounced === q;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const results = useMemo(
    () =>
      [...data].sort(
        (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
      ),
    [data],
  );

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(r: SearchResult) {
    setOpen(false);
    navigate({ to: r.to as never, params: r.params as never });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  const tooShort = q.trim().length < 2;
  const loading = !tooShort && (isFetching || !settled);

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        aria-haspopup="dialog"
        title="Search (Ctrl+K)"
        onClick={() => setOpen(true)}
        className="glass flex h-9 w-9 items-center justify-center rounded-full text-foreground transition hover:bg-white/80"
      >
        <Search className="h-[16px] w-[16px]" strokeWidth={2} />
      </button>

      <DialogShell open={open} onOpenChange={setOpen} widthClassName="max-w-xl" ariaLabel="Search the CRM">
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="global-search-results"
            aria-activedescendant={results[active] ? `gs-${results[active].key}` : undefined}
            aria-label="Search leads, properties, owners, developments and team"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leads, properties, owners, developments..."
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            Esc
          </kbd>
        </div>

        <div
          id="global-search-results"
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          className="max-h-[55vh] overflow-y-auto p-2"
        >
          {tooShort ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Type at least 2 characters. Search by name, phone, email, reference or location.
            </p>
          ) : results.length === 0 && !loading ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              No results for "{debounced.trim()}".
            </p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.key}
                id={`gs-${r.key}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                type="button"
                onMouseMove={() => setActive(i)}
                onClick={() => go(r)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                  i === active ? "bg-qbay-tint ring-1 ring-qbay/25" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "w-[84px] flex-shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium",
                    TYPE_TONE[r.type],
                  )}
                >
                  {r.type}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  {r.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span>Up and Down to move, Enter to open</span>
          <span>Results follow your permissions</span>
        </div>
      </DialogShell>
    </>
  );
}
