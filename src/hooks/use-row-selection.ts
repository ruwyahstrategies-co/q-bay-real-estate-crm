import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Checkbox selection over a list of currently visible row ids. Selected ids
 * that are no longer visible (filtered out, deleted) are dropped so the
 * count always matches what the person can see.
 */
export function useRowSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const idsKey = visibleIds.join(",");

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(visibleIds);
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const toggle = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const count = selected.size;
  const allSelected = visibleIds.length > 0 && count === visibleIds.length;
  const someSelected = count > 0 && !allSelected;

  const toggleAll = useCallback(
    (checked: boolean) => setSelected(checked ? new Set(visibleIds) : new Set()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );
  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({ selected, count, allSelected, someSelected, toggle, toggleAll, clear }),
    [selected, count, allSelected, someSelected, toggle, toggleAll, clear],
  );
}
