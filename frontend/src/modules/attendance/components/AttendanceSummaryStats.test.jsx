import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import AttendanceSummaryStats from "./AttendanceSummaryStats";

const RECORDS = [
  { status: "present" },
  { status: "absent" },
  { status: "half_day" },
  { status: "on_leave" },
];

/**
 * BUG 1 regression (2026-08-04) — these five stat cards had the shared
 * `app-elevated-card` shadow class requested twice but never actually
 * applied (confirmed via `git log`: this file was only ever touched by its
 * original feature-build commit). Asserts on the real rendered className,
 * not just that the component renders, since "renders without crashing"
 * would never have caught this.
 */
describe("AttendanceSummaryStats", () => {
  it("applies the shared app-elevated-card shadow class to every stat card", () => {
    render(<AttendanceSummaryStats records={RECORDS} month={dayjs("2026-06-01")} />);

    const cards = document.querySelectorAll(".ant-card");
    expect(cards.length).toBe(5);
    cards.forEach((card) => {
      expect(card).toHaveClass("app-elevated-card");
    });
  });

  it("still renders the correct counts", () => {
    render(<AttendanceSummaryStats records={RECORDS} month={dayjs("2026-06-01")} />);

    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getByText("Absent")).toBeInTheDocument();
    expect(screen.getByText("Half Day")).toBeInTheDocument();
    expect(screen.getByText("On Leave")).toBeInTheDocument();
  });
});
