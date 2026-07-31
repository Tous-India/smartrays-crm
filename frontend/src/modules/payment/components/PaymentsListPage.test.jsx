import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { MemoryRouter } from "react-router-dom";
import PaymentsListPage from "./PaymentsListPage";
import useSessionStore from "../../../store/sessionStore";
import * as paymentApi from "../api/paymentApi";
import * as customerApi from "../../customer/api/customerApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  // Components read `message` via `App.useApp()` (§7.28 message-rendering
  // fix — the static import silently fails to render under React 19), not
  // the static export, so the mock has to intercept the hook too.
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/paymentApi", () => ({
  listPayments: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  deletePayment: vi.fn(),
  getPaymentAuditLog: vi.fn(),
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
    collectedBy: "user-2",
  },
  {
    _id: "pay-2",
    date: "2026-07-05T00:00:00.000Z",
    customerId: null,
    manualClientName: "Walk-in Client",
    amount: 1500,
    notes: null,
    recordedBy: "user-1",
    collectedBy: null,
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
      data: { data: [{ _id: "user-1", name: "Vinay" }, { _id: "user-2", name: "Sam Sales" }] },
    });
    paymentApi.getPaymentAuditLog.mockResolvedValue({ data: { data: [] } });
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders the fetched payments with resolved customer/recorded-by/collected-by names, paginated", async () => {
    renderPage();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Walk-in Client")).toBeInTheDocument();
    expect(screen.getByText("₹5,000")).toBeInTheDocument();
    expect(screen.getAllByText("Vinay")).toHaveLength(2);
    // Only the first row has collectedBy set — resolves to "Sam Sales";
    // the second row (collectedBy: null) shows "—" rather than blank or
    // a raw id.
    expect(screen.getByText("Sam Sales")).toBeInTheDocument();

    await waitFor(() => {
      expect(paymentApi.listPayments).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 })
      );
    });
  });

  it("displays each payment's date AND time, not just the date", async () => {
    renderPage();
    await screen.findByText("Acme Corp");

    // SAMPLE_PAYMENTS' first row is "2026-07-10T00:00:00.000Z" — asserting
    // via dayjs's own formatting (not a hardcoded string) so this test
    // doesn't depend on which timezone it runs in, matching how the app
    // itself renders it (`PaymentsTable.jsx`'s `dayjs(value).format(...)`).
    const expectedText = dayjs("2026-07-10T00:00:00.000Z").format("DD MMM YYYY, h:mm A");
    expect(screen.getByText(expectedText)).toBeInTheDocument();
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

    it("populates Collected By from the same user directory and includes the selection in the saved payload", async () => {
      paymentApi.createPayment.mockResolvedValue({ data: { data: { _id: "new-payment" } } });

      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getByRole("button", { name: /Record Payment/ }));

      const customerSearch = await screen.findByLabelText("Customer");
      await userEvent.type(customerSearch, "Acme");
      await waitFor(() => expect(customerApi.listCustomers).toHaveBeenCalled());
      await userEvent.click(await screen.findByTitle("Acme Corp"));

      await userEvent.type(screen.getByLabelText("Amount"), "2500");

      await userEvent.click(screen.getByLabelText("Collected By"));
      await userEvent.click(await screen.findByTitle("Sam Sales"));

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(paymentApi.createPayment).toHaveBeenCalledWith(
          expect.objectContaining({ collectedBy: "user-2" })
        );
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

    it("hides Edit/Delete actions (but not View History) for a role with only payments.view", async () => {
      useSessionStore.setState({
        user: { _id: "viewer-1", role: "manager", permissions: { payments: { view: true } } },
        isAuthenticated: true,
        isLoading: false,
      });

      renderPage();
      await screen.findByText("Acme Corp");

      expect(screen.queryByRole("button", { name: "Edit Payment" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete Payment" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "View History" }).length).toBeGreaterThan(0);
    });
  });

  describe("Edit Payment modal", () => {
    it("is pre-filled with the payment's current values", async () => {
      renderPage();
      await screen.findByText("Acme Corp");

      const editButtons = screen.getAllByRole("button", { name: "Edit Payment" });
      await userEvent.click(editButtons[0]);

      expect(await screen.findByRole("dialog", { name: "Edit Payment" })).toBeInTheDocument();
      expect(screen.getByLabelText("Amount")).toHaveValue("5000");
      expect(screen.getByLabelText("Notes")).toHaveValue("First installment");
    });

    it("requires a reason before allowing submit", async () => {
      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getAllByRole("button", { name: "Edit Payment" })[0]);
      await screen.findByRole("dialog", { name: "Edit Payment" });

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("A reason is required to edit a payment")).toBeInTheDocument();
      expect(paymentApi.updatePayment).not.toHaveBeenCalled();
    });

    it("saves the update with the reason and refreshes the table", async () => {
      paymentApi.updatePayment.mockResolvedValue({ data: { data: { _id: "pay-1" } } });

      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getAllByRole("button", { name: "Edit Payment" })[0]);
      await screen.findByRole("dialog", { name: "Edit Payment" });

      await userEvent.clear(screen.getByLabelText("Amount"));
      await userEvent.type(screen.getByLabelText("Amount"), "6000");
      await userEvent.type(screen.getByLabelText("Reason for edit"), "Client paid an extra installment");

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(paymentApi.updatePayment).toHaveBeenCalledWith(
          "pay-1",
          expect.objectContaining({ amount: 6000, reason: "Client paid an extra installment" })
        );
      });
      expect(message.success).toHaveBeenCalledWith("Payment updated");
    });
  });

  describe("Delete Payment modal", () => {
    it("requires a reason before allowing submit", async () => {
      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getAllByRole("button", { name: "Delete Payment" })[0]);
      await screen.findByRole("dialog", { name: "Delete Payment" });

      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("A reason is required to delete a payment")).toBeInTheDocument();
      expect(paymentApi.deletePayment).not.toHaveBeenCalled();
    });

    it("deletes with the reason and removes the payment from the table after refetch", async () => {
      paymentApi.deletePayment.mockResolvedValue({ data: {} });
      // After the delete, the list refetch reflects the row's removal.
      paymentApi.listPayments
        .mockResolvedValueOnce({
          data: { data: { items: SAMPLE_PAYMENTS, total: 2, page: 1, limit: 20 } },
        })
        .mockResolvedValueOnce({
          data: { data: { items: [SAMPLE_PAYMENTS[1]], total: 1, page: 1, limit: 20 } },
        });

      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getAllByRole("button", { name: "Delete Payment" })[0]);
      await screen.findByRole("dialog", { name: "Delete Payment" });

      await userEvent.type(screen.getByLabelText("Reason for deletion"), "Duplicate entry");
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(paymentApi.deletePayment).toHaveBeenCalledWith("pay-1", "Duplicate entry");
      });
      expect(message.success).toHaveBeenCalledWith("Payment deleted");
      await waitFor(() => {
        expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
      });
    });
  });

  describe("View History modal", () => {
    it("fetches and displays the audit log for the selected payment", async () => {
      paymentApi.getPaymentAuditLog.mockResolvedValue({
        data: {
          data: [
            {
              action: "edited",
              reason: "Fixed a typo in the amount",
              changedBy: "user-1",
              createdAt: "2026-07-11T00:00:00.000Z",
              previousValues: { amount: 4000, notes: "old note" },
            },
          ],
        },
      });

      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getAllByRole("button", { name: "View History" })[0]);

      await waitFor(() => {
        expect(paymentApi.getPaymentAuditLog).toHaveBeenCalledWith("pay-1");
      });
      expect(await screen.findByText(/Fixed a typo in the amount/)).toBeInTheDocument();
      expect(screen.getByText("Edited")).toBeInTheDocument();
    });

    it("shows an empty state when there's no history yet", async () => {
      renderPage();
      await screen.findByText("Acme Corp");

      await userEvent.click(screen.getAllByRole("button", { name: "View History" })[0]);

      expect(await screen.findByText("No edits or deletions yet")).toBeInTheDocument();
    });
  });
});
