import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeadsPipelineWidget from "./LeadsPipelineWidget";
import useSessionStore from "../../../store/sessionStore";
import * as leadApi from "../../lead/api/leadApi";

vi.mock("../../lead/api/leadApi", () => ({
  listLeads: vi.fn(),
}));

const ADMIN_USER = { _id: "admin-1", role: "admin", permissions: {} };

function renderWidget() {
  return render(
    <MemoryRouter>
      <LeadsPipelineWidget />
    </MemoryRouter>
  );
}

describe("LeadsPipelineWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: ADMIN_USER, isAuthenticated: true, isLoading: false });
  });

  it("renders a count per status from mocked data", async () => {
    leadApi.listLeads.mockResolvedValue({
      data: {
        data: [
          { _id: "l1", status: "new" },
          { _id: "l2", status: "new" },
          { _id: "l3", status: "won" },
        ],
      },
    });

    renderWidget();

    expect(await screen.findByText("New: 2")).toBeInTheDocument();
    expect(screen.getByText("Won: 1")).toBeInTheDocument();
    expect(screen.getByText("Lost: 0")).toBeInTheDocument();
  });

  it("shows an inline error instead of crashing when the fetch rejects", async () => {
    leadApi.listLeads.mockRejectedValue(new Error("network down"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });

  it("renders nothing for a user with no leads.view grant", async () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(leadApi.listLeads).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
