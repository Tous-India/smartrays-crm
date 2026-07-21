import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AmcRenewalsDueWidget from "./AmcRenewalsDueWidget";
import useSessionStore from "../../../store/sessionStore";
import * as amcApi from "../../amc/api/amcApi";

vi.mock("../../amc/api/amcApi", () => ({
  listAmc: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <AmcRenewalsDueWidget />
    </MemoryRouter>
  );
}

const IN_10_DAYS = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
const IN_60_DAYS = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe("AmcRenewalsDueWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("counts only renewals within the next 30 days from mocked data", async () => {
    amcApi.listAmc.mockResolvedValue({
      data: {
        data: [
          { _id: "amc1", renewalDate: IN_10_DAYS },
          { _id: "amc2", renewalDate: IN_60_DAYS },
          { _id: "amc3", renewalDate: YESTERDAY },
        ],
      },
    });

    renderWidget();

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("shows an inline error instead of crashing when the fetch rejects", async () => {
    amcApi.listAmc.mockRejectedValue(new Error("down"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });

  it("renders nothing for a user with no amc.view grant", async () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(amcApi.listAmc).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
