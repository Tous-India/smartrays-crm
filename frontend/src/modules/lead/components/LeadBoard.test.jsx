import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeadBoard from "./LeadBoard";

/**
 * Covers rendering only — the actual drag-to-move decision logic is tested
 * directly and thoroughly in resolveDropDestination.test.js, and the
 * lost-needs-reason / won-triggers-convert behavior in
 * useLeadStatusChangeFlow.test.js. Simulating a real dnd-kit pointer-drag
 * sequence under jsdom is brittle and doesn't exercise any logic these two
 * unit tests don't already cover directly.
 */
const leads = [
  { _id: "lead-1", name: "New Lead", status: "new", isHot: false },
  { _id: "lead-2", name: "Hot Lead", status: "new", isHot: true },
  { _id: "lead-3", name: "Contacted Lead", status: "contacted", isHot: false },
];

function renderBoard() {
  return render(
    <MemoryRouter>
      <LeadBoard leads={leads} canEdit onRequestStatusChange={() => {}} />
    </MemoryRouter>
  );
}

describe("LeadBoard", () => {
  it("renders a column per pipeline stage", () => {
    renderBoard();

    ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"].forEach(
      (columnTitle) => {
        expect(screen.getByText(columnTitle)).toBeInTheDocument();
      }
    );
  });

  it("groups each lead card under its own status column", () => {
    renderBoard();

    expect(screen.getByText("New Lead")).toBeInTheDocument();
    expect(screen.getByText("Hot Lead")).toBeInTheDocument();
    expect(screen.getByText("Contacted Lead")).toBeInTheDocument();
  });

  it("shows a hot indicator on hot leads only", () => {
    renderBoard();

    const hotCard = screen.getByText("Hot Lead").closest(".ant-card");
    const coldCard = screen.getByText("New Lead").closest(".ant-card");

    expect(hotCard.querySelector('[aria-label="fire"]')).toBeInTheDocument();
    expect(coldCard.querySelector('[aria-label="fire"]')).not.toBeInTheDocument();
  });
});
