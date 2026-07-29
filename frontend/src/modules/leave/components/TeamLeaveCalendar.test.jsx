import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import TeamLeaveCalendar from "./TeamLeaveCalendar";

const JUNE_2026 = dayjs("2026-06-15");

const EMPLOYEE_NAME_BY_ID = new Map([
  ["emp-1", "Employee One"],
  ["emp-2", "Employee Two"],
]);

const APPROVED_PAID_LEAVE = {
  _id: "leave-1",
  employeeId: "emp-1",
  startDate: "2026-06-10T00:00:00.000Z",
  endDate: "2026-06-12T00:00:00.000Z",
  type: "paid",
  status: "approved",
  isHalfDay: false,
};

const PENDING_LEAVE = {
  _id: "leave-2",
  employeeId: "emp-2",
  startDate: "2026-06-05T00:00:00.000Z",
  endDate: "2026-06-05T00:00:00.000Z",
  type: "unpaid",
  status: "pending",
};

describe("TeamLeaveCalendar", () => {
  it("shows an empty state when there is no approved leave this month", () => {
    render(<TeamLeaveCalendar month={JUNE_2026} leaveRequests={[PENDING_LEAVE]} employeeNameById={EMPLOYEE_NAME_BY_ID} />);

    expect(screen.getByText("No approved leave this month")).toBeInTheDocument();
  });

  it("renders one row per employee with approved leave, and colors every day in their range", () => {
    render(<TeamLeaveCalendar month={JUNE_2026} leaveRequests={[APPROVED_PAID_LEAVE]} employeeNameById={EMPLOYEE_NAME_BY_ID} />);

    expect(screen.getByText("Employee One")).toBeInTheDocument();

    const day10 = screen.getByTestId("leave-cell-emp-1-2026-06-10");
    const day11 = screen.getByTestId("leave-cell-emp-1-2026-06-11");
    const day12 = screen.getByTestId("leave-cell-emp-1-2026-06-12");
    const day9 = screen.getByTestId("leave-cell-emp-1-2026-06-9");
    const day13 = screen.getByTestId("leave-cell-emp-1-2026-06-13");

    [day10, day11, day12].forEach((cell) => expect(cell).toHaveAttribute("data-leave-type", "paid"));
    [day9, day13].forEach((cell) => expect(cell).toHaveAttribute("data-leave-type", ""));
  });

  it("excludes a pending leave's employee from the grid entirely", () => {
    render(<TeamLeaveCalendar month={JUNE_2026} leaveRequests={[APPROVED_PAID_LEAVE, PENDING_LEAVE]} employeeNameById={EMPLOYEE_NAME_BY_ID} />);

    expect(screen.queryByText("Employee Two")).not.toBeInTheDocument();
  });
});
