import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Vercel's Hobby plan accepts only cron jobs that run at most once a day; a
// more frequent schedule fails the deployment. Every entry must therefore pin
// a single minute and a single hour (2026-10-23).
const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));

describe("vercel.json crons", () => {
  it.each(vercel.crons.map((cron) => [cron.path, cron.schedule]))("%s (%s) runs at most once a day", (_path, schedule) => {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.trim().split(/\s+/);

    expect(minute).toMatch(/^\d{1,2}$/);
    expect(hour).toMatch(/^\d{1,2}$/);
    expect([dayOfMonth, month, dayOfWeek].every((field) => field === "*" || /^\d{1,2}$/.test(field))).toBe(true);
  });
});
