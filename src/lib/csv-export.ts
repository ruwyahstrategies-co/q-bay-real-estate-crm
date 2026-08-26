// Lightweight client-side CSV export - no server round-trip, no paid service.

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const s = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: { key: keyof T; label: string }[],
): void {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(",")).join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
