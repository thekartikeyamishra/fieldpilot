import { describe, expect, it } from "vitest";
import { CsvError, normaliseHeader, parseCsv } from "@/server/import/csv";
import { canonical, normaliseCode, parseSpec, REQUIRED, TEMPLATES } from "@/server/import/importer";

describe("CSV parsing — what real spreadsheets actually export", () => {
  it("strips the byte-order mark Excel on Windows adds", () => {
    // Left in, the BOM silently corrupts the first header so it never matches.
    const { headers } = parseCsv("\uFEFFsite,asset_code\nPlant 2,P-003");
    expect(headers[0]).toBe("site");
  });

  it("handles CRLF, LF and a mix of both", () => {
    const { rows } = parseCsv("a,b\r\n1,2\n3,4\r\n");
    expect(rows).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
  });

  it("keeps commas and newlines inside quoted fields", () => {
    const { rows } = parseCsv('ref,content\nMP-17,"Isolate, then inspect.\nEscalate if repeated."');
    expect(rows[0].content).toBe("Isolate, then inspect.\nEscalate if repeated.");
  });

  it("unescapes doubled quotes", () => {
    const { rows } = parseCsv('name\n"The ""main"" pump"');
    expect(rows[0].name).toBe('The "main" pump');
  });

  it("skips blank lines and trims whitespace", () => {
    const { rows } = parseCsv("a,b\n\n  1 , 2 \n\n");
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("reports the source line of each row, counting multi-line fields", () => {
    const { lineOf } = parseCsv('a,b\n1,"x\ny"\n2,z');
    expect(lineOf).toEqual([2, 4]);
  });

  it("refuses an unclosed quote instead of swallowing the rest of the file", () => {
    expect(() => parseCsv('a,b\n1,"never closed\n2,3')).toThrow(CsvError);
  });

  it("refuses an empty file", () => {
    expect(() => parseCsv("")).toThrow(CsvError);
    expect(() => parseCsv("\n\n\n")).toThrow(CsvError);
  });

  it("enforces the row limit", () => {
    const big = "a\n" + Array.from({ length: 12 }, (_, i) => String(i)).join("\n");
    expect(() => parseCsv(big, 10)).toThrow(/too many rows/);
  });

  it("tolerates rows shorter than the header", () => {
    const { rows } = parseCsv("a,b,c\n1");
    expect(rows[0]).toEqual({ a: "1", b: "", c: "" });
  });
});

describe("header normalisation — people do not rename columns to match a spec", () => {
  it("maps every common variant to one name", () => {
    for (const h of ["Asset Code", "asset_code", " ASSET-CODE ", "AssetCode", "asset code"]) {
      expect(normaliseHeader(h), h).toBe("asset_code");
    }
  });

  it("routes 'type' to the right field depending on the file", () => {
    // The bug a shared alias map causes: in a procedures file "type" is the
    // asset type the procedure applies to; in an asset file it is the asset's own.
    expect(canonical({ type: "pump" }, "assets")).toEqual({ type: "pump" });
    expect(canonical({ type: "pump" }, "procedures")).toEqual({ asset_type: "pump" });
  });

  it("accepts the aliases maintenance teams really use", () => {
    expect(canonical({ tag: "P-3", plant: "Unit 2", category: "pump", asset_name: "Pump 3" }, "assets")).toEqual({
      asset_code: "P-3",
      site: "Unit 2",
      type: "pump",
      name: "Pump 3",
    });
    expect(canonical({ sop: "MP-17", steps: "..." }, "procedures")).toMatchObject({ reference: "MP-17", content: "..." });
  });

  it("the templates we hand out satisfy their own required columns", () => {
    for (const kind of ["assets", "procedures"] as const) {
      const { headers } = parseCsv(TEMPLATES[kind]);
      const mapped = new Set(headers.map((h) => Object.keys(canonical({ [h]: "x" }, kind))[0]));
      for (const required of REQUIRED[kind]) expect(mapped.has(required), `${kind}.${required}`).toBe(true);
    }
  });
});

describe("asset code normalisation", () => {
  it("makes one machine one asset regardless of how it was typed", () => {
    // The database uniqueness check is case-sensitive; without this, "p-003"
    // and "P-003" become two assets and voice resolution is ambiguous forever.
    expect(normaliseCode(" p-003 ")).toBe("P-003");
    expect(normaliseCode("P-003")).toBe("P-003");
    expect(normaliseCode("pump 3")).toBe("PUMP-3");
  });
});

describe("spec parsing", () => {
  it("turns a free-text spec cell into structured fields", () => {
    expect(parseSpec("operating_pressure_bar: 6.0-8.2; Motor Rating: 15kW")).toEqual({
      operating_pressure_bar: "6.0-8.2",
      motor_rating: "15kW",
    });
  });

  it("ignores malformed fragments rather than failing the row", () => {
    expect(parseSpec("no colon here; :empty key; good: yes")).toEqual({ good: "yes" });
  });

  it("caps runaway values", () => {
    expect(parseSpec(`k: ${"x".repeat(500)}`).k).toHaveLength(200);
  });
});

import { AppError } from "@/lib/errors";

describe("error messages shown to users", () => {
  it("hides internal messages by default", () => {
    const e = new AppError("VALIDATION_FAILED", 'violates constraint "assets_org_code_unique"');
    expect(e.userMessage).not.toContain("assets_org_code_unique");
  });

  it("shows a message explicitly written for the user", () => {
    const e = AppError.forUser("VALIDATION_FAILED", "missing required column: asset_code");
    expect(e.userMessage).toBe("missing required column: asset_code");
  });

  it("caps an exposed message so it cannot flood the UI", () => {
    expect(AppError.forUser("VALIDATION_FAILED", "x".repeat(5000)).userMessage.length).toBeLessThanOrEqual(400);
  });
});
