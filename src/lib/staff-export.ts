import * as XLSX from "xlsx";
import { sb } from "@/lib/db";
import { buildStaffWorkbook, staffExportFilename } from "@/lib/staff-export-workbook";

/**
 * Fetches a team member's operational data through export_team_member_data (administrators
 * only, enforced in the database) and downloads it as a multi-sheet .xlsx. Owner phone and
 * id number follow the same access rule as the rest of the CRM, so they are blank for any
 * owner the exporting administrator is not entitled to see.
 */
export async function exportTeamMemberData(
  memberId: string,
  memberName: string,
  exportedBy: string,
): Promise<{ sheets: number; records: number; filename: string }> {
  const { data, error } = await sb.rpc("export_team_member_data", { _member_id: memberId });
  if (error) throw error;
  const { wb, records } = buildStaffWorkbook((data ?? {}) as Record<string, unknown>, memberName, exportedBy);
  const filename = staffExportFilename(memberName);
  XLSX.writeFile(wb, filename);
  return { sheets: wb.SheetNames.length, records, filename };
}
