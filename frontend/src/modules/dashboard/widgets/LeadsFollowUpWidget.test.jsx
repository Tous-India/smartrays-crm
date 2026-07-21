import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeadsFollowUpWidget from "./LeadsFollowUpWidget";
import useSessionStore from "../../../store/sessionStore";
import * as leadApi from "../../lead/api/leadApi";

vi.mock("../../lead/api/leadApi", () => ({
  listLeads: vi.fn(),
}));

function renderWidget() {
  return render(
    <MemoryRouter>
      <LeadsFollowUpWidget />
    </MemoryRouter>
  );
}

describe("LeadsFollowUpWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      user: { _id: "admin-1", role: "admin", permissions: {} },
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("renders today + overdue counts and a linked list from mocked data", async () => {
    leadApi.listLeads.mockImplementation(({ followUp }) => {
      if (followUp === "today") {
        return Promise.resolve({ data: { data: [{ _id: "l-today", name: "Today Lead" }] } });
      }
      return Promise.resolve({ data: { data: [{ _id: "l-overdue", name: "Overdue Lead" }] } });
    });

    renderWidget();

    expect(await screen.findByText("Overdue Lead")).toBeInTheDocument();
    expect(screen.getByText("Today Lead")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "Today: 1")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "Overdue: 1")).toBeInTheDocument();
  });

  it("shows an inline error instead of crashing when a fetch rejects", async () => {
    leadApi.listLeads.mockRejectedValue(new Error("boom"));

    renderWidget();

    expect(await screen.findByText("Couldn't load this widget")).toBeInTheDocument();
  });
});
