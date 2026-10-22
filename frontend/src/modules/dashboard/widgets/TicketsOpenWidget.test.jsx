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

  it("counts complaints waiting to be picked up and those past the escalation time, and links to them", async () => {
    const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
    ticketApi.listTickets.mockResolvedValue({
      data: {
        data: [
          { _id: "t1", status: "open", assignedToId: "user-1", createdAt: hoursAgo(1) },
          { _id: "t2", status: "open", assignedToId: "user-1", createdAt: hoursAgo(6) },
          { _id: "t3", status: "in_progress", assignedToId: "user-2", createdAt: hoursAgo(10) },
          { _id: "t4", status: "resolved", assignedToId: null, createdAt: hoursAgo(100) },
        ],
      },
    });

    renderWidget();

    expect(await screen.findByText("Customer complaints")).toBeInTheDocument();
    expect(await screen.findByText("2")).toBeInTheDocument(); // waiting
    expect(screen.getByText("1")).toBeInTheDocument(); // overdue (t2: not picked up in 6 h)
    expect(screen.getByRole("link", { name: /View complaints/ })).toHaveAttribute("href", "/complaints");
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
