import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeadsHotWidget from "./LeadsHotWidget";
import useSessionStore from "../../../store/sessionStore";
import * as leadApi from "../../lead/api/leadApi";

vi.mock("../../lead/api/leadApi", () => ({
  listLeads: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <LeadsHotWidget />
    </MemoryRouter>
  );
}

describe("LeadsHotWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("filters to only hot leads client-side (no server isHot filter exists)", async () => {
    leadApi.listLeads.mockResolvedValue({
      data: {
        data: [
          { _id: "l1", name: "Hot One", isHot: true },
          { _id: "l2", name: "Cold One", isHot: false },
        ],
      },
    });

    renderWidget();

    expect(await screen.findByText("Hot One")).toBeInTheDocument();
    expect(screen.queryByText("Cold One")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no hot leads", async () => {
    leadApi.listLeads.mockResolvedValue({ data: { data: [{ _id: "l1", name: "Cold", isHot: false }] } });

    renderWidget();

    expect(await screen.findByText("No hot leads right now")).toBeInTheDocument();
  });
});
