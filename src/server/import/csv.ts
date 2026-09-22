/**
 * A small, strict CSV parser. No dependency, because the edge cases that matter
 * here are specific: what real maintenance teams export from Excel and Google
 * Sheets.
 *
 * Handled deliberately:
 *   - a UTF-8 byte-order mark (Excel on Windows adds one; left in, it silently
 *     corrupts the first header name so "asset_code" never matches)
 *   - CRLF and LF line endings, mixed in one file
 *   - quoted fields containing commas, newlines, and escaped quotes ("")
 *   - blank lines and trailing whitespace
 */
export type ParsedCsv = { headers: string[]; rows: Array<Record<string, string>>; lineOf: number[] };

export class CsvError extends Error {}

export function parseCsv(input: string, maxRows = 5000): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  const startLines: number[] = [];

  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordStart = 1;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }

    if (c === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      if (record.some((f) => f.trim() !== "")) {
        records.push(record);
        startLines.push(recordStart);
      }
      record = [];
      field = "";
      line++;
      recordStart = line;
      if (records.length > maxRows + 1) throw new CsvError(`too many rows — the limit is ${maxRows} per import`);
    } else {
      field += c;
    }
  }

  if (inQuotes) throw new CsvError(`a quoted field starting near line ${recordStart} is never closed`);
  record.push(field);
  if (record.some((f) => f.trim() !== "")) {
    records.push(record);
    startLines.push(recordStart);
  }

  if (records.length === 0) throw new CsvError("the file is empty");
  if (records.length > maxRows + 1) throw new CsvError(`too many rows — the limit is ${maxRows} per import`);

  const headers = records[0].map(normaliseHeader);
  const rows = records.slice(1).map((r) => {
    const out: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) out[h] = (r[idx] ?? "").trim();
    });
    return out;
  });

  return { headers, rows, lineOf: startLines.slice(1) };
}

/**
 * "Asset Code", "asset_code", " ASSET-CODE " and "AssetCode" all mean the same
 * column. People do not rename headers to match a spec, so the parser does it.
 */
export function normaliseHeader(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
