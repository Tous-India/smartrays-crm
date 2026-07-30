import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function renderSection(priorityLeads, handlers = {}) {
  return render(
    <MemoryRouter>
      <PriorityLeadsSection
        priorityLeads={priorityLeads}
        onLogCall={handlers.onLogCall || vi.fn()}
        onRescheduleFollowUp={handlers.onRescheduleFollowUp || vi.fn()}
        onRequestStatusChange={handlers.onRequestStatusChange || vi.fn()}
        onToggleHot={handlers.onToggleHot || vi.fn()}
      />
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

  describe("quick-action icon row", () => {
    it("renders all 5 icon actions per card with the correct accessible names", () => {
      renderSection([makeLead("1", { isHot: false })]);

      expect(screen.getByRole("button", { name: "Log Call" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Won" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Lost" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Mark as Hot" })).toBeInTheDocument();
    });

    it("shows 'Remove Hot' instead of 'Mark as Hot' for a currently-hot lead", () => {
      renderSection([makeLead("1", { isHot: true })]);

      expect(screen.getByRole("button", { name: "Remove Hot" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mark as Hot" })).not.toBeInTheDocument();
    });

    it("Log Call calls onLogCall with the lead, without navigating away", async () => {
      const onLogCall = vi.fn();
      renderSection([makeLead("1")], { onLogCall });

      await userEvent.click(screen.getByRole("button", { name: "Log Call" }));

      expect(onLogCall).toHaveBeenCalledWith(expect.objectContaining({ _id: "1" }));
    });

    it("Won calls onRequestStatusChange with the lead and 'won'", async () => {
      const onRequestStatusChange = vi.fn();
      renderSection([makeLead("1")], { onRequestStatusChange });

      await userEvent.click(screen.getByRole("button", { name: "Won" }));

      expect(onRequestStatusChange).toHaveBeenCalledWith(expect.objectContaining({ _id: "1" }), "won");
    });

    it("Lost calls onRequestStatusChange with the lead and 'lost'", async () => {
      const onRequestStatusChange = vi.fn();
      renderSection([makeLead("1")], { onRequestStatusChange });

      await userEvent.click(screen.getByRole("button", { name: "Lost" }));

      expect(onRequestStatusChange).toHaveBeenCalledWith(expect.objectContaining({ _id: "1" }), "lost");
    });

    it("Mark as Hot calls onToggleHot with the lead", async () => {
      const onToggleHot = vi.fn();
      renderSection([makeLead("1", { isHot: false })], { onToggleHot });

      await userEvent.click(screen.getByRole("button", { name: "Mark as Hot" }));

      expect(onToggleHot).toHaveBeenCalledWith(expect.objectContaining({ _id: "1" }));
    });
  });
});
