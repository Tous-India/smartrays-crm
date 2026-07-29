import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PriorityLeadsSection from "./PriorityLeadsSection";

function makeLead(id, overrides = {}) {
  return {
    _id: id,
    name: `Lead ${id}`,
    companyName: "Acme Corp",
    isHot: true,
    followUpDate: null,
    followUpUrgency: null,
    ...overrides,
  };
}

function renderSection(priorityLeads) {
  return render(
    <MemoryRouter>
      <PriorityLeadsSection priorityLeads={priorityLeads} />
    </MemoryRouter>
  );
}

describe("PriorityLeadsSection", () => {
  it("shows the empty state when there are no priority leads", () => {
    renderSection([]);

    expect(screen.getByText("No hot leads or follow-ups due in the next 3 days")).toBeInTheDocument();
  });

  it("renders fewer than 4 leads in the fill-width grid, with no dead-space cap applied", () => {
    const leads = [makeLead("1"), makeLead("2")];
    renderSection(leads);

    expect(screen.getByText("Lead 1")).toBeInTheDocument();
    expect(screen.getByText("Lead 2")).toBeInTheDocument();
  });

  it("renders every qualifying lead with no '+N more' cap when there are more than 4", () => {
    const leads = [makeLead("1"), makeLead("2"), makeLead("3"), makeLead("4"), makeLead("5"), makeLead("6")];
    renderSection(leads);

    leads.forEach((lead) => {
      expect(screen.getByText(lead.name)).toBeInTheDocument();
    });
    expect(screen.queryByText(/more, view all/i)).not.toBeInTheDocument();
  });
});
