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

const TABLE_HEADER_FILL = "#163b78"; // brand navy — same seed color App.jsx's ConfigProvider uses
const TABLE_HEADER_TEXT = "#ffffff";
const TABLE_ROW_ALT_FILL = "#f3f4f6";
const TABLE_BORDER_COLOR = "#d9dce1";
const TABLE_BODY_TEXT = "#1f2937";
const TABLE_MUTED_TEXT = "#6b7280";
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 24;
const CELL_PADDING_X = 6;

/**
 * Renders a value for a table cell — `rows` carry real typed values (`Date`,
 * `number`, `boolean`, `null`), the same values `generateExcelReport` above
 * wants too (a single row-mapping function feeds both, see each calling
 * module's `build*Rows` helper), so this is where PDF-specific display
 * formatting lives rather than every caller re-implementing it. A `Date`
 * defaults to a date-only display (most report columns — Start Date, Month,
 * Signed Up, etc. — are genuinely date-only); pass `format: "time"` on a
 * column definition for a field where the time-of-day is what matters
 * (Attendance's Check-In/Check-Out), which formats as `HH:MM` instead.
 */
function formatCellValue(value, format) {
  if (value == null || value === "") {
    return "-";
  }

  if (value instanceof Date) {
    return format === "time"
      ? value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : value.toLocaleDateString();
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return String(value);
}

/**
 * Generic PDF **table** report builder (redesigned 2026-08-04 — previously
 * a centered title followed by one plain-text line per row, rendered via a
 * caller-supplied `formatRow`; that approach was replaced everywhere it was
 * used, not just for one module, since every module sharing this function
 * had the identical formatting problem). `columns`: `[{ header, key, width }]`
 * — `width` is a **relative weight**, not a point or character measurement
 * (e.g. `2` for a column that should render twice as wide as a `1`-weighted
 * one); actual point widths are computed by distributing the page's usable
 * width proportionally, so callers never need to hand-tune absolute
 * measurements or account for page size themselves. `rows`: plain objects
 * keyed by each column's `key`, holding real typed values (see
 * `formatCellValue` above) — the exact same row shape `generateExcelReport`
 * consumes, so a caller building both formats computes rows once and passes
 * the same array to each. `subtitle` (optional) renders under the title in
 * smaller, muted text — the report's active date range/filters, when the
 * caller has one worth surfacing.
 *
 * Pagination: a new page (with the header row redrawn) starts automatically
 * once the next row wouldn't fit above the bottom margin — `pdfkit` has no
 * built-in table/pagination support, so this is hand-rolled rather than
 * pulled in as a dependency, matching this function's own existing "simple
 * enough not to need a table library" scope.
 */
export function generatePdfReport({ title, subtitle, columns, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageLeft = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    const totalWeight = columns.reduce((sum, column) => sum + column.width, 0);
    const scaledColumns = columns.map((column) => ({
      ...column,
      width: (column.width / totalWeight) * usableWidth,
    }));

    doc.fontSize(18).fillColor(TABLE_BODY_TEXT).font("Helvetica-Bold").text(title, pageLeft, doc.y, {
      width: usableWidth,
      align: "center",
    });
    doc.font("Helvetica");

    if (subtitle) {
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(TABLE_MUTED_TEXT).text(subtitle, { width: usableWidth, align: "center" });
    }

    doc.moveDown(1);
    let y = doc.y;

    function drawHeaderRow() {
      doc.rect(pageLeft, y, usableWidth, HEADER_HEIGHT).fill(TABLE_HEADER_FILL);

      let x = pageLeft;
      doc.fontSize(9).font("Helvetica-Bold").fillColor(TABLE_HEADER_TEXT);
      scaledColumns.forEach((column) => {
        doc.text(column.header, x + CELL_PADDING_X, y + 7, { width: column.width - CELL_PADDING_X * 2 });
        x += column.width;
      });
      doc.font("Helvetica");

      y += HEADER_HEIGHT;
    }

    drawHeaderRow();

    if (rows.length === 0) {
      doc
        .fontSize(10)
        .fillColor(TABLE_MUTED_TEXT)
        .text("No records match these filters.", pageLeft, y + 8, { width: usableWidth, align: "center" });
    }

    rows.forEach((row, index) => {
      if (y + ROW_HEIGHT > pageBottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeaderRow();
      }

      if (index % 2 === 1) {
        doc.rect(pageLeft, y, usableWidth, ROW_HEIGHT).fill(TABLE_ROW_ALT_FILL);
      }
      doc.rect(pageLeft, y, usableWidth, ROW_HEIGHT).lineWidth(0.5).strokeColor(TABLE_BORDER_COLOR).stroke();

      let x = pageLeft;
      doc.fontSize(9).fillColor(TABLE_BODY_TEXT);
      scaledColumns.forEach((column) => {
        doc.text(formatCellValue(row[column.key], column.format), x + CELL_PADDING_X, y + 6, {
          width: column.width - CELL_PADDING_X * 2,
          height: ROW_HEIGHT - 4,
          ellipsis: true,
        });
        x += column.width;
      });

      y += ROW_HEIGHT;
    });

    doc.end();
  });
}
