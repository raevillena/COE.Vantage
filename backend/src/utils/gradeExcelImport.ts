import ExcelJS from "exceljs";
import { badRequest } from "./errors.js";

/** Read the first worksheet as string matrix: row 0 = headers, following rows = data. */
export async function readFirstSheetAsStringMatrix(buffer: Buffer | Uint8Array): Promise<{ header: string[]; dataRows: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await workbook.xlsx.load(nodeBuffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw badRequest("Excel workbook has no worksheets");

  const rawRows: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const maxCol = Math.max(row.cellCount, 1);
    const cells: string[] = [];
    for (let c = 1; c <= maxCol; c += 1) {
      const cell = row.getCell(c);
      const text = typeof cell.text === "string" ? cell.text.trim() : String(cell.value ?? "").trim();
      cells.push(text);
    }
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    rawRows.push(cells.length > 0 ? cells : [""]);
  });

  while (rawRows.length > 0 && rawRows[0].every((v) => v === "")) rawRows.shift();
  if (rawRows.length < 2) {
    throw badRequest("First sheet must have a header row and at least one data row with values");
  }

  const header = rawRows[0].map((h) => h.trim());
  const unpaddedData = rawRows.slice(1).filter((r) => r.some((c) => c !== ""));
  if (unpaddedData.length === 0) {
    throw badRequest("No non-empty data rows found under the header");
  }

  const maxLen = Math.max(header.length, ...unpaddedData.map((r) => r.length));
  const paddedHeader = [...header, ...Array.from({ length: Math.max(0, maxLen - header.length) }, () => "")];
  const dataRows = unpaddedData.map((r) => {
    const copy = [...r];
    while (copy.length < maxLen) copy.push("");
    return copy.slice(0, maxLen);
  });

  return { header: paddedHeader, dataRows };
}
