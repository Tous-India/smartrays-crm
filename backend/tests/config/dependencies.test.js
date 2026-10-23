import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// 2026-10-23: package.json listed mongodb@3.7 (end-of-life, with known
// vulnerabilities) although nothing imported it — Mongoose brings its own,
// current driver. Keep it out, and keep code from importing the driver
// directly behind Mongoose's back.
const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(full);
    return /\.(js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe("backend dependencies", () => {
  it("does not list the raw mongodb driver (Mongoose provides it)", () => {
    expect(pkg.dependencies.mongodb).toBeUndefined();
  });

  it("no source file imports the raw mongodb driver", () => {
    const offenders = [...sourceFiles(path.join(process.cwd(), "src")), ...sourceFiles(path.join(process.cwd(), "api"))].filter((file) =>
      /from\s+["']mongodb["']|require\(\s*["']mongodb["']\s*\)/.test(fs.readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
