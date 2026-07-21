import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TicketsOpenWidget from "./TicketsOpenWidget";
import useSessionStore from "../../../store/sessionStore";
import * as ticketApi from "../../ticket/api/ticketApi";

vi.mock("../../ticket/api/ticketApi", () => ({
  listTickets: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <TicketsOpenWidget />
    </MemoryRouter>
  );
}

describe("TicketsOpenWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("derives open + open-and-unassigned counts from mocked data", async () => {
    ticketApi.listTickets.mockResolvedValue({
      data: {
        data: [
          { _id: "t1", status: "open", assignedToId: null },
          { _id: "t2", status: "open", assignedToId: "user-1" },
          { _id: "t3", status: "closed", assignedToId: null },
        ],
      },
    });

    renderWidget();

    expect(await screen.findByText("2")).toBeInTheDocument(); // open
    expect(screen.getByText("1")).toBeInTheDocument(); // unassigned
  });

  it("shows an inline error instead of crashing when the fetch rejects", async () => {
    ticketApi.listTickets.mockRejectedValue(new Error("down"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });

  it("renders nothing for a user with no tickets.view_all grant", async () => {
    useSessionStore.setState({
      user: { _id: "employee-1", role: "employee", permissions: { tickets: { view_assigned: true } } },
      isAuthenticated: true,
      isLoading: false,
    });

    const { container } = renderWidget();

    await waitFor(() => {
      expect(ticketApi.listTickets).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
