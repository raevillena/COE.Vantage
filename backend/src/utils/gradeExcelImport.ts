import ExcelJS from "exceljs";
import { badRequest } from "./errors.js";

/** Read the first worksheet as a string matrix, row for row (blank rows kept), so the shared parser can find the header row. */
export async function readFirstSheetAsRows(buffer: Buffer | Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await workbook.xlsx.load(nodeBuffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw badRequest("Excel workbook has no worksheets");

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const maxCol = Math.max(row.cellCount, 1);
    const cells: string[] = [];
    for (let c = 1; c <= maxCol; c += 1) {
      const cell = row.getCell(c);
      const text = typeof cell.text === "string" ? cell.text.trim() : String(cell.value ?? "").trim();
      cells.push(text);
    }
    rows.push(cells);
  });

  if (rows.filter((row) => row.some((cell) => cell !== "")).length < 3) {
    throw badRequest("First sheet must have a header row, a max-score row (the row under it), and at least one student row");
  }
  return rows;
}
