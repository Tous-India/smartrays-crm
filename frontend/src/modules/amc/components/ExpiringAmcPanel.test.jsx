import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ExpiringAmcPanel, { daysRemaining } from "./ExpiringAmcPanel";
import useSessionStore from "../../../store/sessionStore";
import * as amcApi from "../api/amcApi";

/**
 * §7.42 (2026-08-06) — the renewals-due panel above the Customers table.
 */

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/amcApi", () => ({
  listExpiringAmc: vi.fn(),
  renewAmc: vi.fn(),
}));

const { message } = await import("antd");

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

const SOON = {
  _id: "amc-soon",
  customerId: "cust-1",
  customerName: "Acme Industries",
  amount: 50000,
  startDate: iso(-330),
  renewalDate: iso(12),
  status: "active",
  isExpiringSoon: true,
};

const OVERDUE = {
  _id: "amc-overdue",
  customerId: "cust-2",
  customerName: "Beta Logistics",
  amount: 25000,
  startDate: iso(-400),
  renewalDate: iso(-7),
  status: "active",
  isExpiringSoon: false,
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <ExpiringAmcPanel />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // amc.edit granted by default; the gate is asserted separately.
  useSessionStore.setState({
    user: { _id: "u1", role: "sales_associate", permissions: { amc: { view: true, edit: true } } },
  });
  amcApi.listExpiringAmc.mockResolvedValue({ data: { data: [SOON, OVERDUE] } });
});

describe("ExpiringAmcPanel — hides when there is nothing to do", () => {
  it("renders NOTHING when no AMCs are expiring", async () => {
    amcApi.listExpiringAmc.mockResolvedValue({ data: { data: [] } });

    const { container } = renderPanel();

    await waitFor(() => expect(amcApi.listExpiringAmc).toHaveBeenCalled());
    // Not an empty state, not a collapsed shell — nothing. A permanently
    // empty panel above the table trains people to ignore the space.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("expiring-amc-panel")).not.toBeInTheDocument();
  });

  it("renders nothing rather than a flash of empty panel while loading", () => {
    amcApi.listExpiringAmc.mockReturnValue(new Promise(() => {}));

    const { container } = renderPanel();

    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden — and does not break the page — if the request fails", async () => {
    amcApi.listExpiringAmc.mockRejectedValue(new Error("boom"));

    const { container } = renderPanel();

    await waitFor(() => expect(amcApi.listExpiringAmc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ExpiringAmcPanel — the worklist", () => {
  it("shows customer name, renewal date, amount and days remaining per row", async () => {
    renderPanel();

    expect(await screen.findByText("Acme Industries")).toBeInTheDocument();
    expect(screen.getByText("Beta Logistics")).toBeInTheDocument();
    expect(screen.getByText("₹50,000")).toBeInTheDocument();
    expect(screen.getByTestId("remaining-amc-soon")).toHaveTextContent("12 days left");
  });

  it("distinguishes OVERDUE from expiring-soon", async () => {
    renderPanel();

    await screen.findByText("Beta Logistics");

    const overdue = screen.getByTestId("remaining-amc-overdue");
    const soon = screen.getByTestId("remaining-amc-soon");

    expect(overdue).toHaveTextContent("Overdue by 7 days");
    // Different tag colour class, not merely different words.
    expect(overdue.className).not.toBe(soon.className);
    expect(overdue.className).toMatch(/error/);
  });

  it("counts the rows in the header, so a collapsed panel still says how many", async () => {
    renderPanel();

    await screen.findByText("Acme Industries");

    expect(screen.getByText("Renewals due")).toBeInTheDocument();
    expect(within(screen.getByTestId("expiring-amc-count")).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1 overdue")).toBeInTheDocument();
  });

  it("links each row to that customer", async () => {
    renderPanel();

    expect(await screen.findByRole("link", { name: "Acme Industries" })).toHaveAttribute(
      "href",
      "/customers/cust-1"
    );
  });

  /**
   * The Customers table below already fires one `/customers/:id/contracts`
   * request per row. This panel must not add a second N+1 — the customer name
   * rides along on the single list query.
   */
  it("costs exactly ONE request regardless of row count", async () => {
    amcApi.listExpiringAmc.mockResolvedValue({
      data: {
        data: [
          SOON,
          OVERDUE,
          { ...SOON, _id: "a3", customerId: "cust-3", customerName: "Gamma Foods" },
          { ...SOON, _id: "a4", customerId: "cust-4", customerName: "Delta Metals" },
        ],
      },
    });

    renderPanel();

    await screen.findByText("Gamma Foods");
    expect(screen.getByText("Delta Metals")).toBeInTheDocument();
    // Four rows, one request — the name came with the list.
    expect(amcApi.listExpiringAmc).toHaveBeenCalledTimes(1);
  });
});

describe("ExpiringAmcPanel — renewing", () => {
  it("uses the existing renew endpoint and drops the row on success", async () => {
    amcApi.renewAmc.mockResolvedValue({ data: { data: {} } });
    // After renewing, the server marks the old record expired and stops
    // returning it, so the refetch comes back with only the other row.
    amcApi.listExpiringAmc
      .mockResolvedValueOnce({ data: { data: [SOON, OVERDUE] } })
      .mockResolvedValueOnce({ data: { data: [OVERDUE] } });

    renderPanel();
    await screen.findByText("Acme Industries");

    await userEvent.click(screen.getByTestId("renew-amc-soon"));
    await userEvent.click(await screen.findByRole("button", { name: /Renew AMC|Confirm|OK/i }));

    await waitFor(() => expect(amcApi.renewAmc).toHaveBeenCalledWith("amc-soon", expect.any(Object)));
    await waitFor(() => expect(screen.queryByText("Acme Industries")).not.toBeInTheDocument());
    // The other row is untouched.
    expect(screen.getByText("Beta Logistics")).toBeInTheDocument();
  });

  it("surfaces the server's message and keeps the row on failure", async () => {
    amcApi.renewAmc.mockRejectedValue({ response: { data: { message: "Renewal window closed" } } });

    renderPanel();
    await screen.findByText("Acme Industries");

    await userEvent.click(screen.getByTestId("renew-amc-soon"));
    await userEvent.click(await screen.findByRole("button", { name: /Renew AMC|Confirm|OK/i }));

    await waitFor(() => expect(message.error).toHaveBeenCalledWith("Renewal window closed"));
    expect(screen.getByText("Acme Industries")).toBeInTheDocument();
  });
});

describe("ExpiringAmcPanel — permission gate", () => {
  it("hides Renew from a user without amc.edit, but still shows the rows", async () => {
    useSessionStore.setState({
      user: { _id: "u2", role: "sales_associate", permissions: { amc: { view: true, edit: false } } },
    });

    renderPanel();

    // Visibility of the list is not the same grant as acting on it.
    expect(await screen.findByText("Acme Industries")).toBeInTheDocument();
    expect(screen.queryByTestId("renew-amc-soon")).not.toBeInTheDocument();
  });

  it("shows Renew to an admin via the can() admin bypass", async () => {
    useSessionStore.setState({ user: { _id: "u3", role: "admin", permissions: {} } });

    renderPanel();

    expect(await screen.findByTestId("renew-amc-soon")).toBeInTheDocument();
  });
});

describe("daysRemaining", () => {
  it("counts whole days, negative once the date has passed", () => {
    const now = new Date(2026, 5, 10, 12, 0, 0);

    expect(daysRemaining({ renewalDate: new Date(2026, 5, 20) }, now)).toBe(10);
    expect(daysRemaining({ renewalDate: new Date(2026, 5, 10) }, now)).toBe(0);
    expect(daysRemaining({ renewalDate: new Date(2026, 5, 3) }, now)).toBe(-7);
  });

  it("ignores the time of day, so 'today' is not off by one", () => {
    const now = new Date(2026, 5, 10, 23, 30, 0);

    expect(daysRemaining({ renewalDate: new Date(2026, 5, 11, 0, 30, 0) }, now)).toBe(1);
  });
});
