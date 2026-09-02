// Owner contract generation - no paid PDF service, same approach as
// property-pdf.ts: fill the template's placeholders, open a print-ready
// window, the user saves it as a PDF via the browser's print dialog.
// The filled HTML is also stored on the owner_contracts row
// (generated_html) so history survives later template edits.

import type { ContractTemplate, Owner, OwnerContract, Property } from "./db";
import { fmtDate } from "./db";
import { APP_CONFIG } from "./config";

export function fillContractTemplate(
  bodyHtml: string,
  vars: { owner: Owner; property?: Property | null; contract: Partial<OwnerContract> },
): string {
  const { owner, property, contract } = vars;
  const replacements: Record<string, string> = {
    owner_name: owner.name,
    owner_company: owner.company ?? "",
    owner_code: owner.code ?? "",
    property_title: property?.title ?? "",
    property_reference: property?.reference_code ?? "",
    amount: contract.amount != null ? String(contract.amount) : "",
    currency: contract.currency ?? "QAR",
    commission_rate: contract.commission_rate != null ? String(contract.commission_rate) : "",
    commission_amount: contract.commission_amount != null ? String(contract.commission_amount) : "",
    start_date: contract.start_date ? fmtDate(contract.start_date) : "",
    end_date: contract.end_date ? fmtDate(contract.end_date) : "",
    expiry_date: contract.expiry_date ? fmtDate(contract.expiry_date) : "",
    terms: contract.terms ?? "",
  };
  return bodyHtml.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => replacements[key] ?? "");
}

export function openContractPdf(filledHtml: string, title: string) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!win) return;
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} - ${escapeHtml(APP_CONFIG.companyName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #171717; margin: 0; padding: 32px; line-height: 1.6; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  table { border-collapse: collapse; margin: 16px 0; }
  td { padding: 6px 12px 6px 0; font-size: 13px; }
  .footer { margin-top: 40px; font-size: 11px; color: #727272; border-top: 1px solid #e9e9e5; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  ${filledHtml}
  <div class="footer">${escapeHtml(APP_CONFIG.companyName)} - generated ${new Date().toLocaleDateString()}</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function contractTitle(template: ContractTemplate | null | undefined, owner: Owner, property?: Property | null): string {
  const base = template?.name ?? "Agreement";
  return property ? `${base} - ${property.title}` : `${base} - ${owner.name}`;
}
