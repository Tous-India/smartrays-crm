import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PaymentsThisMonthWidget from "./PaymentsThisMonthWidget";
import useSessionStore from "../../../store/sessionStore";
import * as paymentApi from "../../payment/api/paymentApi";

vi.mock("../../payment/api/paymentApi", () => ({
  listPayments: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <PaymentsThisMonthWidget />
    </MemoryRouter>
  );
}

const NOW = new Date();
const THIS_MONTH_ISO = new Date(NOW.getFullYear(), NOW.getMonth(), 10).toISOString();
const LAST_MONTH_ISO = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 10).toISOString();

describe("PaymentsThisMonthWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("sums only this calendar month's payment amounts from mocked data", async () => {
    paymentApi.listPayments.mockResolvedValue({
      data: {
        data: {
          items: [
            { _id: "p1", date: THIS_MONTH_ISO, amount: 1000 },
            { _id: "p2", date: THIS_MONTH_ISO, amount: 500 },
            { _id: "p3", date: LAST_MONTH_ISO, amount: 9999 },
          ],
          total: 3,
          page: 1,
          limit: null,
        },
      },
    });

    renderWidget();

    expect(await screen.findByText("1,500")).toBeInTheDocument();
  });

  it("shows an inline error instead of crashing when the fetch rejects", async () => {
    paymentApi.listPayments.mockRejectedValue(new Error("down"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });

  it("renders nothing for a user with no payments.view grant", async () => {
    useSessionStore.setState({
      user: { _id: "manager-1", role: "manager", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(paymentApi.listPayments).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
