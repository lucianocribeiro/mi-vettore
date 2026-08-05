import type { Response } from "express";
import ExcelJS from "exceljs";

export type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
};

export async function sendExcel(
  res: Response,
  opts: {
    sheetName: string;
    filename: string;
    columns: ExcelColumn[];
    rows: Record<string, unknown>[];
  }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(opts.sheetName);
  sheet.columns = opts.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 16,
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of opts.rows) sheet.addRow(row);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${opts.filename}"`
  );
  await workbook.xlsx.write(res);
  res.end();
}
