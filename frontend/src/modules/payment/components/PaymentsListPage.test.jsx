import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import PaymentsListPage from "./PaymentsListPage";
import useSessionStore from "../../../store/sessionStore";
import * as paymentApi from "../api/paymentApi";
import * as customerApi from "../../customer/api/customerApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, message: { success: vi.fn(), error: vi.fn() } };
});

vi.mock("../api/paymentApi", () => ({
  listPayments: vi.fn(),
  createPayment: vi.fn(),
}));

vi.mock("../../customer/api/customerApi", () => ({
  listCustomers: vi.fn(),
}));

vi.mock("../../../services/userDirectoryApi", () => ({
  fetchUserDropdown: vi.fn(),
}));

const { fetchUserDropdown } = await import("../../../services/userDirectoryApi");
const { message } = await import("antd");

const SAMPLE_PAYMENTS = [
  {
    _id: "pay-1",
    date: "2026-07-10T00:00:00.000Z",
    customerId: "cust-1",
    manualClientName: null,
    amount: 5000,
    notes: "First installment",
    recordedBy: "user-1",
  },
  {
    _id: "pay-2",
    date: "2026-07-05T00:00:00.000Z",
    customerId: null,
    manualClientName: "Walk-in Client",
    amount: 1500,
    notes: null,
    recordedBy: "user-1",
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <PaymentsListPage />
    </MemoryRouter>
  );
}

describe("PaymentsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentApi.listPayments.mockResolvedValue({
      data: { data: { items: SAMPLE_PAYMENTS, total: 2, page: 1, limit: 20 } },
    });
    customerApi.listCustomers.mockResolvedValue({
      data: { data: [{ _id: "cust-1", companyName: "Acme Corp" }] },
    });
    fetchUserDropdown.mockResolvedValue({
      data: { data: [{ _id: "user-1", name: "Vinay" }] },
    });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders the fetched payments with resolved customer/recorded-by names, paginated", async () => {
    renderPage();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Walk-in Client")).toBeInTheDocument();
    expect(screen.getByText("₹5,000")).toBeInTheDocument();
    expect(screen.getAllByText("Vinay")).toHaveLength(2);

    await waitFor(() => {
      expect(paymentApi.listPayments).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 })
      );
    });
  });

  it("defaults to Today and requests a from/to range covering just today", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    const now = new Date();
    const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    expect(paymentApi.listPayments).toHaveBeenCalledWith(
      expect.objectContaining({ from: expectedDate, to: expectedDate })
    );
  });

  it("re-fetches with an empty range when All Time is selected", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByText("All Time"));

    await waitFor(() => {
      expect(paymentApi.listPayments).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: "", to: "", page: 1 })
      );
    });
  });

  it("re-fetches with today's date as both from and to when Today is selected", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByText("Today"));

    const now = new Date();
    const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    await waitFor(() => {
      expect(paymentApi.listPayments).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: expectedDate, to: expectedDate })
      );
    });
  });

  it("computes an April-March financial year range when Financial Year is selected", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByText("Financial Year"));

    await waitFor(() => {
      const lastCall = paymentApi.listPayments.mock.calls.at(-1)[0];
      expect(lastCall.from).toMatch(/-04-01$/);
      expect(lastCall.to).toMatch(/-03-31$/);
    });
  });

  it("resets to page 1 when switching filters", async () => {
    paymentApi.listPayments.mockResolvedValue({
      data: { data: { items: SAMPLE_PAYMENTS, total: 50, page: 1, limit: 20 } },
    });
    renderPage();
    await screen.findByText("Acme Corp");

    await userEvent.click(screen.getByText("2"));
    await waitFor(() => {
      expect(paymentApi.listPayments).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });

    await userEvent.click(screen.getByText("All Time"));
    await waitFor(() => {
      expect(paymentApi.listPayments).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    });
  });

  describe("Record Payment modal", () => {
    it("searches customers as-you-type, saves with the right payload, and refreshes the table", async () => {
      paymentApi.createPayment.mockResolvedValue({ data: { data: { _id: "new-payment" } } });

      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getByRole("button", { name: /Record Payment/ }));

      const customerSearch = await screen.findByLabelText("Customer");
      await userEvent.type(customerSearch, "Acme");

      await waitFor(() => {
        expect(customerApi.listCustomers).toHaveBeenCalledWith(
          expect.objectContaining({ search: "Acme" })
        );
      });

      await userEvent.click(await screen.findByTitle("Acme Corp"));

      const amountInput = screen.getByLabelText("Amount");
      await userEvent.type(amountInput, "2500");

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(paymentApi.createPayment).toHaveBeenCalledWith(
          expect.objectContaining({ customerId: "cust-1", amount: 2500 })
        );
      });
      await waitFor(() => {
        expect(message.success).toHaveBeenCalledWith("Payment recorded");
      });
      // Called once on mount, once after the save-triggered refetch.
      await waitFor(() => {
        expect(paymentApi.listPayments).toHaveBeenCalledTimes(2);
      });
    });

    it("requires a customer and an amount before saving", async () => {
      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getByRole("button", { name: /Record Payment/ }));
      await userEvent.click(await screen.findByRole("button", { name: "Save" }));

      expect(await screen.findByText("Select a customer")).toBeInTheDocument();
      expect(screen.getByText("Amount is required")).toBeInTheDocument();
      expect(paymentApi.createPayment).not.toHaveBeenCalled();
    });
  });

  describe("permission gating", () => {
    it("hides Record Payment for a role with no payments.create grant", async () => {
      useSessionStore.setState({
        user: { _id: "manager-1", role: "manager", permissions: { payments: { view: true } } },
        isAuthenticated: true,
        isLoading: false,
      });

      renderPage();
      await screen.findByText("Acme Corp");

      expect(screen.queryByRole("button", { name: /Record Payment/ })).not.toBeInTheDocument();
    });

    it("shows a 403 result instead of the table for a role with no payments.view grant", async () => {
      useSessionStore.setState({
        user: { _id: "employee-1", role: "employee", permissions: {} },
        isAuthenticated: true,
        isLoading: false,
      });

      renderPage();

      expect(await screen.findByText("Not authorized")).toBeInTheDocument();
      expect(paymentApi.listPayments).not.toHaveBeenCalled();
    });
  });
});
