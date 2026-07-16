import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

/**
 * Generic tabular Excel report builder — groundwork for the real shared
 * reports pipeline (§7.11, Phase 8), not built yet. Modules that need an
 * `.xlsx` export today (currently just Attendance's `GET /attendance/report`)
 * call this instead of hand-rolling `exceljs` calls inline in a controller,
 * so §7.11 has one real function to formalize/extend later rather than
 * duplicated ad hoc logic scattered across modules. Column definitions and
 * row shaping stay in the calling module — those are inherently
 * domain-specific and don't belong in a shared service.
 *
 * Deliberately NOT retrofitted onto Leads' existing `.xlsx` export
 * (`lead.service.js#exportLeadsToExcel`, built before this service existed)
 * — that code already works and is already tested; migrating it isn't part
 * of this task and risks a regression for no behavior change.
 */
export async function generateExcelReport({ sheetName, columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = columns;
  rows.forEach((row) => worksheet.addRow(row));

  return workbook.xlsx.writeBuffer();
}

/**
 * Generic PDF report builder — a centered title followed by one line of text
 * per row, rendered via a caller-supplied `formatRow`. Deliberately simple
 * (no table layout) — `pdfkit` has no built-in table support, and building
 * one is out of scope until §7.11 actually needs richer layout than a plain
 * report needs today.
 */
export function generatePdfReport({ title, rows, formatRow }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(title, { align: "center" });
    doc.moveDown();

    rows.forEach((row) => {
      doc.fontSize(10).text(formatRow(row));
    });

    doc.end();
  });
}
