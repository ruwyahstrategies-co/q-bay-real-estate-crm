import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  ImportFileError,
  autoMapColumns,
  collectIssues,
  executeLeadImport,
  loadImportFile,
  planBlockers,
  planLeadImport,
  sheetToTable,
  type DbErrorLike,
  type LeadColumnMapping,
  type LeadImportClient,
  type LeadImportOptions,
  type ParsedTable,
} from "../lead-import";
import { cleanSpreadsheetPhone, phoneMatchKey } from "../phone";

/* ---------------------------- fixture generators ---------------------------- */

type Cell = string | number;

function workbookOf(sheets: Record<string, Cell[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return wb;
}

function toBuffer(wb: XLSX.WorkBook, bookType: "xlsx" | "biff8"): ArrayBuffer {
  const out = XLSX.write(wb, { type: "array", bookType }) as ArrayBuffer | Uint8Array;
  const bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function csvText(rows: Cell[][]): string {
  const esc = (c: Cell) =>
    /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c);
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

function csvBuffer(rows: Cell[][]): ArrayBuffer {
  const bytes = new TextEncoder().encode(csvText(rows));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const HEADER: Cell[] = ["Full Name", "Mobile", "Email", "Sale or Rent", "Budget", "Notes"];
const SAMPLE: Cell[][] = [
  HEADER,
  ["Aisha Al-Thani", 97455551234, "aisha@example.com", "Sale", "1.5M", "wants Lusail"],
  ["Omar Khaled", "+974 5555 2222", "", "Rent", "12,000", ""],
  ["Sara N", "(974) 5555-3333", "", "Tenant", "", ""],
];

const MEMBERS = [
  { id: "m-abdo", full_name: "Abdo", email: "abdo@qbay.test", code: "AB" },
  { id: "m-wissal", full_name: "Wissal", email: "wissal@qbay.test", code: "WI" },
  { id: "m-arabic", full_name: "محمد الكعبي", email: null, code: null },
  { id: "m-arabic2", full_name: "علي الهاجري", email: null, code: null },
];
const STAGES = [
  { key: "new_lead", label: "New Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

let idCounter = 0;
function options(over: Partial<LeadImportOptions> = {}): LeadImportOptions {
  return {
    defaultIntent: "sale",
    duplicateAction: "skip",
    defaultLeadSource: "Import",
    defaultAgentId: "m-abdo",
    canAssignOthers: true,
    currentMemberId: "m-abdo",
    teamMembers: MEMBERS,
    stages: STAGES,
    existing: [],
    newId: () => `id-${++idCounter}`,
    ...over,
  };
}

function tableOf(rows: Cell[][]): ParsedTable {
  const file = loadImportFile("x.xlsx", toBuffer(workbookOf({ Sheet1: rows }), "xlsx"));
  assert.equal(file.kind, "workbook");
  return sheetToTable((file as { workbook: XLSX.WorkBook }).workbook, "Sheet1");
}

const FULL_MAP = (t: ParsedTable): LeadColumnMapping => autoMapColumns(t.headers);

/* --------------------------------- reading --------------------------------- */

describe("reading CSV, XLSX and XLS", () => {
  const expectSample = (t: ParsedTable) => {
    assert.deepEqual(t.headers, HEADER);
    assert.equal(t.rows.length, 3);
    assert.deepEqual(
      t.rows.map((r) => r.rowNumber),
      [2, 3, 4],
    );
    assert.equal(t.rows[0].values[0], "Aisha Al-Thani");
  };

  it("reads an XLSX file, keeping a numeric phone cell as its exact digits", () => {
    const file = loadImportFile("leads.xlsx", toBuffer(workbookOf({ Leads: SAMPLE }), "xlsx"));
    assert.equal(file.kind, "workbook");
    const t = sheetToTable((file as { workbook: XLSX.WorkBook }).workbook, "Leads");
    expectSample(t);
    assert.equal(t.rows[0].values[1], "97455551234");
  });

  it("reads a legacy XLS (BIFF8) file", () => {
    const file = loadImportFile("leads.xls", toBuffer(workbookOf({ Leads: SAMPLE }), "biff8"));
    assert.equal(file.kind, "workbook");
    const t = sheetToTable((file as { workbook: XLSX.WorkBook }).workbook, "Leads");
    expectSample(t);
    assert.equal(t.rows[0].values[1], "97455551234");
  });

  it("reads a CSV file, including a UTF-8 byte order mark and quoted commas", () => {
    const rows: Cell[][] = [
      ...SAMPLE,
      ["Comma, Person", "55554444", "", "Sale", "", 'likes "quiet" streets'],
    ];
    const bytes = new TextEncoder().encode("\uFEFF" + csvText(rows));
    const buf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const file = loadImportFile("leads.csv", buf);
    assert.equal(file.kind, "csv");
    const t = (file as { table: ParsedTable }).table;
    assert.deepEqual(t.headers, HEADER);
    assert.equal(t.rows[3].values[0], "Comma, Person");
    assert.equal(t.rows[3].values[5], 'likes "quiet" streets');
  });

  it("lists every worksheet so the user can pick one", () => {
    const wb = workbookOf({ Summary: [["nothing here"]], Leads: SAMPLE });
    const file = loadImportFile("multi.xlsx", toBuffer(wb, "xlsx"));
    assert.deepEqual((file as { sheetNames: string[] }).sheetNames, ["Summary", "Leads"]);
  });

  it("reports real spreadsheet row numbers when there are blank rows", () => {
    const rows: Cell[][] = [
      HEADER,
      ["A One", "55550001", "", "Sale", "", ""],
      [],
      ["B Two", "55550002", "", "Rent", "", ""],
    ];
    const file = loadImportFile("x.xlsx", toBuffer(workbookOf({ S: rows }), "xlsx"));
    const t = sheetToTable((file as { workbook: XLSX.WorkBook }).workbook, "S");
    assert.deepEqual(
      t.rows.map((r) => r.rowNumber),
      [2, 4],
    );
  });

  it("gives a clear message for unsupported, empty and corrupt files", () => {
    assert.throws(
      () => loadImportFile("leads.pdf", new ArrayBuffer(10)),
      (e: unknown) => {
        assert.ok(e instanceof ImportFileError);
        assert.match((e as Error).message, /CSV, XLSX or XLS/);
        return true;
      },
    );
    assert.throws(() => loadImportFile("empty.csv", new ArrayBuffer(0)), /empty/);
    assert.throws(() => loadImportFile("blank.csv", csvBuffer([[""], [""]])), /empty/);
    assert.throws(() => loadImportFile("headeronly.csv", csvBuffer([HEADER])), /No lead rows/);
    const junk = new Uint8Array(4000).map((_, i) => (i * 7) % 251);
    const junkBuf = junk.buffer.slice(0) as ArrayBuffer;
    try {
      const f = loadImportFile("corrupt.xlsx", junkBuf);
      // A lenient reader must still not invent leads out of garbage.
      if (f.kind === "workbook") {
        assert.throws(() => sheetToTable(f.workbook, f.sheetNames[0]));
      }
    } catch (e) {
      assert.ok(e instanceof ImportFileError);
    }
  });
});

/* ------------------------------ column mapping ------------------------------ */

describe("column mapping", () => {
  it("maps common headers and never uses one column twice", () => {
    const m = autoMapColumns([
      "Client Name",
      "Mobile No",
      "E-mail",
      "Sale/Rent",
      "Max Budget",
      "Agent",
      "Source",
      "Remarks",
    ]);
    assert.equal(m.full_name, 0);
    assert.equal(m.phone, 1);
    assert.equal(m.email, 2);
    assert.equal(m.transaction_intent, 3);
    assert.equal(m.budget_max, 4);
    assert.equal(m.assigned_agent, 5);
    assert.equal(m.lead_source, 6);
    assert.equal(m.notes, 7);
    const cols = Object.values(m).filter((v) => v != null);
    assert.equal(new Set(cols).size, cols.length);
  });

  it("blocks the import until both Full Name and Phone are mapped", () => {
    assert.equal(planBlockers({ full_name: 0, phone: 1 }).length, 0);
    assert.equal(planBlockers({ full_name: 0 }).length, 1);
    assert.match(planBlockers({ full_name: 0 })[0], /Phone is required/);
    assert.equal(planBlockers({}).length, 2);
  });
});

/* ----------------------------------- phone ---------------------------------- */

describe("phone handling", () => {
  it("matches the same number written differently", () => {
    const keys = [
      "+974 5555 1234",
      "0097455551234",
      "97455551234",
      "55551234",
      "(974) 5555-1234",
    ].map(phoneMatchKey);
    assert.equal(new Set(keys).size, 1);
    assert.notEqual(phoneMatchKey("+44 7700 900123"), phoneMatchKey("55551234"));
  });

  it("repairs what Excel does to phone numbers and refuses what cannot be repaired", () => {
    assert.equal(cleanSpreadsheetPhone("97455551234.0").value, "97455551234");
    assert.equal(cleanSpreadsheetPhone("97,455,551,234").value, "97455551234");
    assert.equal(cleanSpreadsheetPhone("'+97455551234").value, "+97455551234");
    assert.match(cleanSpreadsheetPhone("9.74555E+10").problem ?? "", /scientific notation/);
  });
});

/* -------------------------------- validation -------------------------------- */

describe("row validation", () => {
  it("names the real row for a missing phone and a too-short phone", () => {
    const rows: Cell[][] = [HEADER];
    for (let i = 2; i <= 30; i++)
      rows.push([`Lead ${i}`, `5555${String(1000 + i)}`, "", "Sale", "", ""]);
    rows[16] = ["No Phone", "", "", "Sale", "", ""]; // spreadsheet row 17
    rows[28] = ["Short Phone", "12345", "", "Sale", "", ""]; // spreadsheet row 29
    const t = tableOf(rows);
    const plan = planLeadImport(t, FULL_MAP(t), options());
    const bad = plan.rows.filter((r) => r.status === "invalid");
    assert.deepEqual(
      bad.map((r) => r.rowNumber),
      [17, 29],
    );
    assert.deepEqual(bad[0].reasons, ["phone number is required"]);
    assert.deepEqual(bad[1].reasons, ["phone number looks too short"]);
    assert.equal(plan.counts.total, 29);
    assert.equal(plan.counts.valid, 27);
    assert.equal(plan.counts.invalid, 2);
    assert.equal(plan.counts.insert, 27);
    const issues = collectIssues(plan);
    assert.ok(issues.some((i) => i.row === 17 && /phone number is required/.test(i.detail)));
  });

  it("a bad row does not stop the good ones", () => {
    const t = tableOf([
      HEADER,
      ["Good", "55550001", "", "Sale", "", ""],
      ["", "55550002", "", "Sale", "", ""],
      ["Also Good", "55550003", "", "Rent", "", ""],
    ]);
    const plan = planLeadImport(t, FULL_MAP(t), options());
    assert.equal(plan.counts.insert, 2);
    assert.equal(plan.rows[1].reasons[0], "full name is required");
  });

  it("accepts text +974 numbers, spaces, hyphens, brackets and numeric cells", () => {
    const t = tableOf([
      HEADER,
      ["Numeric", 97455551234, "", "Sale", "", ""],
      ["Plus", "+974 5555 2222", "", "Sale", "", ""],
      ["Hyphen", "5555-3333", "", "Sale", "", ""],
      ["Bracket", "(974) 5555 4444", "", "Sale", "", ""],
    ]);
    const plan = planLeadImport(t, FULL_MAP(t), options());
    assert.equal(plan.counts.invalid, 0);
    assert.deepEqual(
      plan.rows.map((r) => r.payload?.phone),
      ["97455551234", "+974 5555 2222", "5555-3333", "(974) 5555 4444"],
    );
  });

  it("ignores a broken email with a warning instead of failing the lead", () => {
    const t = tableOf([HEADER, ["E", "55550001", "not-an-email", "Sale", "", ""]]);
    const plan = planLeadImport(t, FULL_MAP(t), options());
    assert.equal(plan.rows[0].status, "insert");
    assert.equal(plan.rows[0].payload?.email, null);
    assert.match(plan.rows[0].warnings[0], /not valid/);
  });

  it("parses budgets like 1.5M and 12,000, and warns about junk without failing", () => {
    const t = tableOf([
      ["Full Name", "Phone", "Budget Min", "Budget Max"],
      ["a", "55550001", "12,000", "1.5M"],
      ["b", "55550002", "lots", ""],
    ]);
    const plan = planLeadImport(t, FULL_MAP(t), options());
    assert.equal(plan.rows[0].payload?.budget_min, 12000);
    assert.equal(plan.rows[0].payload?.budget_max, 1500000);
    assert.equal(plan.rows[1].status, "insert");
    assert.equal(plan.rows[1].payload?.budget_min, null);
    assert.match(plan.rows[1].warnings[0], /not a number/);
  });
});

/* ------------------------------- Sale and Rent ------------------------------- */

describe("Sale and Rent", () => {
  const T = () =>
    tableOf([
      ["Full Name", "Phone", "Sale or Rent", "Classification"],
      ["a", "55550001", "Sale", ""],
      ["b", "55550002", "Rent", ""],
      ["c", "55550003", "Buyer", ""],
      ["d", "55550004", "Tenant", ""],
      ["e", "55550005", "", ""],
      ["f", "55550006", "", "Renter"],
      ["g", "55550007", "Rent", "Buyer"],
      ["h", "55550008", "Maybe", ""],
      ["i", "55550009", "Sale", "Investor"],
      ["j", "55550010", "Rent", "Property Owner"],
    ]);

  it("reads Sale and Rent from the file, including Buyer and Tenant wording", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options({ defaultIntent: "sale" }));
    const intent = plan.rows.map((r) => r.payload?.transaction_intent ?? null);
    assert.deepEqual(intent, [
      "sale",
      "rent",
      "sale",
      "rent",
      "sale",
      "rent",
      null,
      null,
      "sale",
      "rent",
    ]);
  });

  it("uses the import default when the row has no intent, and it can be Rent", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options({ defaultIntent: "rent" }));
    assert.equal(plan.rows[4].payload?.transaction_intent, "rent");
    assert.equal(plan.rows[4].payload?.classification, "renter");
    // No column at all: every row follows the default.
    const t2 = tableOf([
      ["Full Name", "Phone"],
      ["x", "55550001"],
      ["y", "55550002"],
    ]);
    const p2 = planLeadImport(t2, FULL_MAP(t2), options({ defaultIntent: "rent" }));
    assert.deepEqual(
      p2.rows.map((r) => r.payload?.transaction_intent),
      ["rent", "rent"],
    );
    assert.deepEqual(
      p2.rows.map((r) => r.payload?.classification),
      ["renter", "renter"],
    );
  });

  it("infers Rent from an unambiguous Renter classification", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options({ defaultIntent: "sale" }));
    assert.equal(plan.rows[5].payload?.transaction_intent, "rent");
    assert.equal(plan.rows[5].payload?.classification, "renter");
  });

  it("rejects a classification that does not fit the intent, and unknown wording", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options());
    assert.equal(plan.rows[6].status, "invalid");
    assert.match(plan.rows[6].reasons[0], /Buyer does not fit a Rent lead/);
    assert.equal(plan.rows[7].status, "invalid");
    assert.match(plan.rows[7].reasons[0], /"Maybe" is not recognised/);
  });

  it("keeps Investor, Commercial and Property Owner valid for both sides", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options());
    assert.equal(plan.rows[8].payload?.classification, "investor");
    assert.equal(plan.rows[9].payload?.classification, "owner");
  });

  it("supports a mixed Sale and Rent import in one file", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options());
    const intents = new Set(
      plan.rows.filter((r) => r.payload).map((r) => r.payload?.transaction_intent),
    );
    assert.deepEqual([...intents].sort(), ["rent", "sale"]);
  });
});

/* ------------------------- assignment and scoping ------------------------- */

describe("assignment", () => {
  it("gives every lead to an ordinary agent, whatever the agent column says", () => {
    const t = tableOf([
      ["Full Name", "Phone", "Agent"],
      ["a", "55550001", "Wissal"],
      ["b", "55550002", ""],
    ]);
    const plan = planLeadImport(
      t,
      FULL_MAP(t),
      options({ canAssignOthers: false, currentMemberId: "m-abdo", defaultAgentId: "m-abdo" }),
    );
    assert.deepEqual(
      plan.rows.map((r) => r.payload?.assigned_agent_id),
      ["m-abdo", "m-abdo"],
    );
    assert.equal(plan.notes.length, 1);
  });

  it("lets an administrator assign per row, default to themselves, or leave unassigned", () => {
    const t = tableOf([
      ["Full Name", "Phone", "Agent"],
      ["a", "55550001", "wissal"],
      ["b", "55550002", ""],
      ["c", "55550003", "abdo@qbay.test"],
    ]);
    const plan = planLeadImport(t, FULL_MAP(t), options({ defaultAgentId: "m-abdo" }));
    assert.deepEqual(
      plan.rows.map((r) => r.payload?.assigned_agent_id),
      ["m-wissal", "m-abdo", "m-abdo"],
    );
    const unassigned = planLeadImport(t, FULL_MAP(t), options({ defaultAgentId: null }));
    assert.equal(unassigned.rows[1].payload?.assigned_agent_id, null);
  });

  it("rejects an agent that does not exist, and never mixes up Arabic names", () => {
    const t = tableOf([
      ["Full Name", "Phone", "Agent"],
      ["a", "55550001", "Nobody"],
      ["b", "55550002", "محمد الكعبي"],
      ["c", "55550003", "علي الهاجري"],
      ["d", "55550004", "خالد"],
    ]);
    const plan = planLeadImport(t, FULL_MAP(t), options());
    assert.match(plan.rows[0].reasons[0], /"Nobody" was not found/);
    assert.equal(plan.rows[1].payload?.assigned_agent_id, "m-arabic");
    assert.equal(plan.rows[2].payload?.assigned_agent_id, "m-arabic2");
    assert.equal(plan.rows[3].status, "invalid");
  });

  it("uses the default lead source only when the file does not give one", () => {
    const t = tableOf([
      ["Full Name", "Phone", "Source"],
      ["a", "55550001", "Instagram"],
      ["b", "55550002", ""],
    ]);
    const plan = planLeadImport(t, FULL_MAP(t), options({ defaultLeadSource: "Import" }));
    assert.deepEqual(
      plan.rows.map((r) => r.payload?.lead_source),
      ["Instagram", "Import"],
    );
  });
});

/* -------------------------------- duplicates -------------------------------- */

describe("duplicates", () => {
  const existing = [
    { id: "L1", phone: "+974 5555 1234", email: null },
    { id: "L2", phone: null, email: "Known@Example.com" },
  ];
  const T = () =>
    tableOf([
      ["Full Name", "Phone", "Email", "Notes"],
      ["Same phone, other format", "97455551234", "", "n1"],
      ["Same email", "55559999", "known@example.com", "n2"],
      ["Brand new", "55557777", "", "n3"],
      ["New again, same phone in file", "55557777", "", "n4"],
      ["Same email in file", "55558888", "dup@example.com", ""],
      ["Same email in file again", "55558889", "DUP@example.com", ""],
    ]);

  it("skip: matches across phone formats and by email, and reports each duplicate", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options({ existing, duplicateAction: "skip" }));
    assert.deepEqual(
      plan.rows.map((r) => r.status),
      ["skip", "skip", "insert", "skip", "insert", "skip"],
    );
    assert.equal(plan.counts.duplicatesExisting, 2);
    assert.equal(plan.counts.duplicatesInFile, 2);
    assert.match(plan.rows[3].reasons[0], /duplicate of row 4 in this file/);
    assert.equal(plan.counts.insert, 2);
    assert.equal(plan.counts.skip, 4);
  });

  it("update: fills in only what the file provides and never blanks or defaults", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options({ existing, duplicateAction: "update" }));
    assert.equal(plan.rows[0].status, "update");
    assert.equal(plan.rows[0].targetId, "L1");
    assert.equal(plan.rows[1].targetId, "L2");
    const patch = plan.rows[0].patch!;
    assert.equal(patch.notes, "n1");
    for (const forbidden of [
      "email",
      "transaction_intent",
      "classification",
      "workflow",
      "pipeline_stage",
      "assigned_agent_id",
      "lead_source",
    ]) {
      assert.equal(forbidden in patch, false, `${forbidden} must not be touched`);
    }
    assert.equal(plan.counts.update, 2);
  });

  it("new: imports duplicates as new leads, including repeats within the file", () => {
    const t = T();
    const plan = planLeadImport(t, FULL_MAP(t), options({ existing, duplicateAction: "new" }));
    assert.equal(plan.counts.insert, 6);
    assert.equal(plan.counts.skip, 0);
  });
});

/* --------------------------------- execution --------------------------------- */

function fakeClient(over: Partial<LeadImportClient> = {}) {
  const calls = {
    inserts: [] as Record<string, unknown>[][],
    updates: [] as string[],
    history: [] as unknown[],
  };
  const client: LeadImportClient = {
    insertLeads: async (rows) => {
      calls.inserts.push(rows);
      return null;
    },
    updateLead: async (id) => {
      calls.updates.push(id);
      return { error: null, updated: true };
    },
    insertHistory: async (rows) => {
      calls.history.push(...rows);
    },
    ...over,
  };
  return { client, calls };
}

describe("running an import", () => {
  const bigTable = () => {
    const rows: Cell[][] = [["Full Name", "Phone", "Sale or Rent"]];
    for (let i = 0; i < 120; i++)
      rows.push([`Lead ${i}`, `5556${String(1000 + i)}`, i % 2 ? "Rent" : "Sale"]);
    return tableOf(rows);
  };

  it("inserts in chunks without asking for rows back, records history, and counts everything", async () => {
    const t = bigTable();
    const plan = planLeadImport(t, FULL_MAP(t), options());
    const { client, calls } = fakeClient();
    const progress: number[] = [];
    const res = await executeLeadImport(plan, client, {
      chunkSize: 50,
      onProgress: (d) => progress.push(d),
    });
    assert.equal(res.imported, 120);
    assert.equal(res.failed, 0);
    assert.deepEqual(
      calls.inserts.map((c) => c.length),
      [50, 50, 20],
    );
    assert.equal(calls.history.length, 120);
    assert.equal(progress.at(-1), 120);
    // Every payload carries its own id so history can be written without reading rows back.
    assert.ok(calls.inserts.flat().every((p) => typeof p.id === "string"));
  });

  it("finds the one bad row in a failed chunk and still imports the rest", async () => {
    const t = bigTable();
    const plan = planLeadImport(t, FULL_MAP(t), options());
    const badId = plan.rows[73].payload!.id;
    const { client } = fakeClient({
      insertLeads: async (rows): Promise<DbErrorLike | null> =>
        rows.some((r) => r.id === badId)
          ? { code: "23514", message: "Phone number is required" }
          : null,
    });
    const res = await executeLeadImport(plan, client, { chunkSize: 50 });
    assert.equal(res.imported, 119);
    assert.equal(res.failed, 1);
    assert.deepEqual(res.failures, [
      { rowNumber: plan.rows[73].rowNumber, message: "phone number is required" },
    ]);
  });

  it("reports a permission refusal per row, never as a whole-file mystery", async () => {
    const t = tableOf([
      ["Full Name", "Phone"],
      ["a", "55550001"],
      ["b", "55550002"],
    ]);
    const plan = planLeadImport(t, FULL_MAP(t), options());
    const { client } = fakeClient({
      insertLeads: async () => ({
        code: "42501",
        message: 'new row violates row-level security policy for table "leads"',
      }),
    });
    const res = await executeLeadImport(plan, client);
    assert.equal(res.imported, 0);
    assert.equal(res.failed, 2);
    assert.deepEqual(
      res.failures.map((f) => f.rowNumber),
      [2, 3],
    );
    assert.match(res.failures[0].message, /not allowed/);
  });

  it("does not count an update the database silently ignored", async () => {
    const t = tableOf([
      ["Full Name", "Phone", "Notes"],
      ["a", "55551234", "n"],
      ["b", "55559999", "n"],
    ]);
    const plan = planLeadImport(
      t,
      FULL_MAP(t),
      options({
        duplicateAction: "update",
        existing: [
          { id: "MINE", phone: "55551234", email: null },
          { id: "NOT-MINE", phone: "55559999", email: null },
        ],
      }),
    );
    const { client } = fakeClient({
      updateLead: async (id) => ({ error: null, updated: id === "MINE" }),
    });
    const res = await executeLeadImport(plan, client);
    assert.equal(res.updated, 1);
    assert.equal(res.failed, 1);
    assert.equal(res.failures[0].rowNumber, 3);
    assert.match(res.failures[0].message, /not allowed to edit/);
  });

  it("keeps skipped and invalid counts alongside imported and failed", async () => {
    const t = tableOf([
      ["Full Name", "Phone"],
      ["ok", "55550001"],
      ["", "55550002"],
      ["dup", "55550001"],
    ]);
    const plan = planLeadImport(t, FULL_MAP(t), options());
    const { client } = fakeClient();
    const res = await executeLeadImport(plan, client);
    assert.deepEqual(
      [res.imported, res.updated, res.skipped, res.invalid, res.failed],
      [1, 0, 1, 1, 0],
    );
  });
});
