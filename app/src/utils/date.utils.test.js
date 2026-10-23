import fs from "fs";
import path from "path";
import { formatDate, formatShortDate, formatMonth, formatTime } from "./date.utils";

/**
 * 2026-10-23 (owner's decision): one Indian format everywhere — DD MMM YYYY —
 * the same as the web, whatever language the phone is set to.
 */
test("dates are DD MMM YYYY, short dates DD MMM, months 'October 2026', times h:mm AM/PM", () => {
  expect(formatDate("2026-10-03T08:30:00")).toBe("03 Oct 2026");
  expect(formatShortDate("2026-09-22T10:00:00")).toBe("22 Sep");
  expect(formatMonth(new Date(2026, 9, 1))).toBe("October 2026");
  expect(formatTime("2026-10-23T13:05:00")).toBe("1:05 PM");
  expect(formatTime("2026-10-23T00:10:00")).toBe("12:10 AM");
  expect(formatDate(null)).toBe("—");
});

test("no screen formats a date with the phone's own locale", () => {
  function sourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });
  }
  const src = path.join(__dirname, "..");
  const offenders = sourceFiles(src)
    .filter((file) => /toLocaleDateString\(|toLocaleTimeString\(/.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(src, file));
  expect(offenders).toEqual([]);
});
