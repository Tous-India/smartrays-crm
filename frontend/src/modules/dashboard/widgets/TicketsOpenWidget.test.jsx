import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TicketsOpenWidget from "./TicketsOpenWidget";
import useSessionStore from "../../../store/sessionStore";
import * as complaintApi from "../../complaint/api/complaintApi";

vi.mock("../../complaint/api/complaintApi", () => ({
  listComplaints: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <TicketsOpenWidget />
    </MemoryRouter>
  );
}

const setUser = (user) => useSessionStore.setState({ user, isAuthenticated: true, isLoading: false });

describe("TicketsOpenWidget — customer complaints on the dashboard (2026-10-23)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts complaints not assigned yet and those past their visit date, and links to them", async () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });
    complaintApi.listComplaints.mockResolvedValue({
      data: {
        data: [
          { _id: "a", status: "open", visitDate: null },
          { _id: "b", status: "open", visitDate: null },
          { _id: "c", status: "working", visitDate: "2020-01-01" },
          { _id: "d", status: "assigned", visitDate: "2999-01-01" },
          { _id: "e", status: "resolved", visitDate: "2020-01-01" },
        ],
      },
    });
    renderWidget();

    await waitFor(() => expect(screen.getByText("Not assigned").closest(".ant-statistic")).toHaveTextContent("2"));
    expect(screen.getByText("Visit date passed").closest(".ant-statistic")).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /View complaints/ })).toHaveAttribute("href", "/complaints");
  });

  it("shows for someone granted complaints.assign, not for a manager with only the old tickets permissions", async () => {
    complaintApi.listComplaints.mockResolvedValue({ data: { data: [] } });
    setUser({ _id: "m-1", role: "manager", permissions: { tickets: { view_all: true, assign: true } } });
    const { unmount } = renderWidget();
    expect(screen.queryByText("Customer complaints")).not.toBeInTheDocument();
    expect(complaintApi.listComplaints).not.toHaveBeenCalled();
    unmount();

    setUser({ _id: "c-1", role: "employee", permissions: { complaints: { view_all: true, assign: true } } });
    renderWidget();
    expect(await screen.findByText("Customer complaints")).toBeInTheDocument();
  });
});
