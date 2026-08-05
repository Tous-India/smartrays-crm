import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomerAmcSection, { buildChains } from "./CustomerAmcSection";
import useSessionStore from "../../../store/sessionStore";
import * as amcApi from "../api/amcApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/amcApi", () => ({
  listAmcForCustomer: vi.fn(),
  renewAmc: vi.fn(),
}));

const ACTIVE = {
  _id: "amc-active",
  customerId: "cust-1",
  amount: 12000,
  startDate: "2026-01-01T00:00:00.000Z",
  renewalDate: "2027-01-01T00:00:00.000Z",
  status: "active",
  isExpiringSoon: false,
  previousAmcId: null,
};

const EXPIRING = {
  _id: "amc-expiring",
  customerId: "cust-1",
  amount: 8000,
  startDate: "2025-09-01T00:00:00.000Z",
  renewalDate: "2026-08-20T00:00:00.000Z",
  status: "active",
  isExpiringSoon: true,
  previousAmcId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({
    user: { _id: "admin-1", role: "admin", permissions: {} },
    isAuthenticated: true,
    isLoading: false,
  });
  amcApi.listAmcForCustomer.mockResolvedValue({ data: { data: [ACTIVE] } });
});

describe("CustomerAmcSection", () => {
  it("fetches only this customer's AMC records", async () => {
    render(<CustomerAmcSection customerId="cust-1" />);

    await waitFor(() => expect(amcApi.listAmcForCustomer).toHaveBeenCalledWith("cust-1"));
  });

  it("renders a stat card with amount, start date, renewal date and status", async () => {
    render(<CustomerAmcSection customerId="cust-1" />);

    const card = await screen.findByTestId("amc-card-amc-active");
    expect(within(card).getByText("₹12,000")).toBeInTheDocument();
    expect(within(card).getByText(/Start: 01 Jan 2026/)).toBeInTheDocument();
    expect(within(card).getByText(/Renews: 01 Jan 2027/)).toBeInTheDocument();
    expect(within(card).getByText("Active")).toBeInTheDocument();
  });

  it("gives an expiring-soon AMC a warning treatment distinct from expired", async () => {
    amcApi.listAmcForCustomer.mockResolvedValue({
      data: { data: [EXPIRING, { ...ACTIVE, _id: "amc-old", status: "expired", isExpiringSoon: false }] },
    });

    render(<CustomerAmcSection customerId="cust-1" />);

    const expiring = await screen.findByTestId("amc-card-amc-expiring");
    const expired = screen.getByTestId("amc-card-amc-old");

    expect(within(expiring).getByText("Expiring soon")).toBeInTheDocument();
    expect(expiring.className).toContain("amber");

    expect(within(expired).getByText("Expired")).toBeInTheDocument();
    expect(expired.className).not.toContain("amber");
  });

  it("shows an empty state when the customer has no AMC", async () => {
    amcApi.listAmcForCustomer.mockResolvedValue({ data: { data: [] } });

    render(<CustomerAmcSection customerId="cust-1" />);

    expect(await screen.findByText("No AMC records for this customer")).toBeInTheDocument();
  });

  it("surfaces a fetch failure instead of looking like an empty AMC list", async () => {
    amcApi.listAmcForCustomer.mockRejectedValue(new Error("boom"));

    render(<CustomerAmcSection customerId="cust-1" />);

    expect(await screen.findByText(/Could not load AMC records/)).toBeInTheDocument();
  });

  describe("renewal chains", () => {
    const FIRST = { ...ACTIVE, _id: "t1", status: "expired", amount: 10000, previousAmcId: null };
    const SECOND = { ...ACTIVE, _id: "t2", status: "expired", amount: 11000, previousAmcId: "t1" };
    const THIRD = { ...ACTIVE, _id: "t3", status: "active", amount: 12000, previousAmcId: "t2" };

    it("renders ONE card for a chain — past terms are not top-level cards", async () => {
      amcApi.listAmcForCustomer.mockResolvedValue({ data: { data: [FIRST, SECOND, THIRD] } });

      render(<CustomerAmcSection customerId="cust-1" />);

      expect(await screen.findByTestId("amc-card-t3")).toBeInTheDocument();
      expect(screen.queryByTestId("amc-card-t1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("amc-card-t2")).not.toBeInTheDocument();
    });

    it('shows a compact "Renewed 2×" line that expands to the term history', async () => {
      amcApi.listAmcForCustomer.mockResolvedValue({ data: { data: [FIRST, SECOND, THIRD] } });

      render(<CustomerAmcSection customerId="cust-1" />);

      const toggle = await screen.findByRole("button", { name: /Renewed 2×/ });
      expect(screen.queryByTestId("amc-history-t3")).not.toBeInTheDocument();

      await userEvent.click(toggle);

      const history = await screen.findByTestId("amc-history-t3");
      expect(within(history).getByText(/₹11,000/)).toBeInTheDocument();
      expect(within(history).getByText(/₹10,000/)).toBeInTheDocument();
    });

    it("buildChains walks predecessors newest-first and never loops on cyclic data", () => {
      const [chain] = buildChains([FIRST, SECOND, THIRD]);

      expect(chain.current._id).toBe("t3");
      expect(chain.history.map((term) => term._id)).toEqual(["t2", "t1"]);

      const cyclic = [
        { ...FIRST, previousAmcId: "t2" },
        { ...SECOND, previousAmcId: "t1" },
      ];
      expect(() => buildChains(cyclic)).not.toThrow();
    });
  });

  describe("renew action", () => {
    it("opens a modal pre-filled with the suggested dates and amount", async () => {
      render(<CustomerAmcSection customerId="cust-1" />);

      await userEvent.click(await screen.findByRole("button", { name: /Renew/ }));

      const dialog = await screen.findByRole("dialog");
      // startDate defaults to the current term's renewal date; renewal +1yr.
      expect(within(dialog).getByDisplayValue("01 Jan 2027")).toBeInTheDocument();
      expect(within(dialog).getByDisplayValue("01 Jan 2028")).toBeInTheDocument();
      expect(within(dialog).getByDisplayValue("12000")).toBeInTheDocument();
    });

    it("submits the renewal and refetches", async () => {
      amcApi.renewAmc.mockResolvedValue({ data: { data: {} } });

      render(<CustomerAmcSection customerId="cust-1" />);
      await userEvent.click(await screen.findByRole("button", { name: /Renew/ }));
      await userEvent.click(await screen.findByRole("button", { name: "Confirm Renewal" }));

      await waitFor(() => {
        expect(amcApi.renewAmc).toHaveBeenCalledWith("amc-active", {
          startDate: "2027-01-01",
          renewalDate: "2028-01-01",
          amount: 12000,
        });
      });
      expect(amcApi.listAmcForCustomer).toHaveBeenCalledTimes(2);
    });

    it("sends plain YYYY-MM-DD, never a toISOString() of local midnight", async () => {
      amcApi.renewAmc.mockResolvedValue({ data: { data: {} } });

      render(<CustomerAmcSection customerId="cust-1" />);
      await userEvent.click(await screen.findByRole("button", { name: /Renew/ }));
      await userEvent.click(await screen.findByRole("button", { name: "Confirm Renewal" }));

      await waitFor(() => expect(amcApi.renewAmc).toHaveBeenCalled());
      const [, payload] = amcApi.renewAmc.mock.calls[0];
      expect(payload.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(payload.startDate).not.toContain("T");
    });

    it("hides Renew from a user without amc.edit", async () => {
      useSessionStore.setState({
        user: { _id: "emp-1", role: "employee", permissions: { amc: { view: true } } },
        isAuthenticated: true,
        isLoading: false,
      });

      render(<CustomerAmcSection customerId="cust-1" />);

      await screen.findByTestId("amc-card-amc-active");
      expect(screen.queryByRole("button", { name: /Renew/ })).not.toBeInTheDocument();
    });
  });
});
