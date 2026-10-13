import { useMemo } from "react";
import { SearchableSelectField } from "@/components/select-field";
import { useMasterData } from "@/hooks/use-master-data";
import {
  MASTER_KIND_LABELS,
  buildMasterOptions,
  type MasterCurrent,
  type MasterKind,
} from "@/lib/master-data";

/**
 * Searchable select for an approved Developer or Company. There is deliberately no "create"
 * option here: new values are added by administrators in Settings > Developers & Companies.
 * The form keeps `value` (an approved value id, the legacy marker, or "") and turns it into the
 * pair to save with resolveMasterSelection().
 */
export function MasterSelectField({
  kind,
  value,
  onChange,
  current,
  disabled,
  className,
}: {
  kind: MasterKind;
  value: string;
  onChange: (value: string) => void;
  /** What the record already stores, so historical values stay visible. */
  current?: MasterCurrent;
  disabled?: boolean;
  className?: string;
}) {
  const labels = MASTER_KIND_LABELS[kind];
  const { data: values = [], isLoading } = useMasterData(kind);
  const options = useMemo(() => buildMasterOptions(values, current), [values, current]);

  return (
    <SearchableSelectField
      value={value}
      onChange={(v) => onChange(v ?? "")}
      options={options}
      placeholder={isLoading ? "Loading..." : `Select ${labels.singular.toLowerCase()}`}
      searchPlaceholder={`Search ${labels.plural.toLowerCase()}...`}
      emptyMessage={`No approved ${labels.plural.toLowerCase()} found. An administrator can add one in Settings.`}
      emptyLabel="None"
      disabled={disabled}
      className={className}
    />
  );
}
