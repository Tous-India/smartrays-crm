import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportWizardModal from "./ImportWizardModal";
import { importLeads } from "../api/leadApi";

vi.mock("../api/leadApi", () => ({
  importLeads: vi.fn(),
}));

function makeCsvFile() {
  const csvContent = "name,email,status\nJane Doe,jane@example.com,new\nBad Row,,bogus-status";
  return new File([csvContent], "leads.csv", { type: "text/csv" });
}

describe("ImportWizardModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("walks through upload -> preview/mapping -> result", async () => {
    importLeads.mockResolvedValue({
      data: {
        data: {
          importedCount: 1,
          duplicateCount: 0,
          failedCount: 1,
          skippedCount: 1,
          skipped: [{ row: 3, type: "invalid", reason: "Invalid status: bogus-status" }],
        },
      },
    });

    render(<ImportWizardModal open onCancel={() => {}} onImported={() => {}} />);

    expect(screen.getByText("Upload File")).toBeInTheDocument();

    const fileInput = document.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, makeCsvFile());

    // File-read is async (FileReader) — wait for the preview data to land
    // before advancing, otherwise "Next" is still disabled.
    await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Preview & Mapping")).toBeInTheDocument();
    // The header "name" maps to lead field "name" per the fixed alias list —
    // both the mapping table's header cell and its matched-field cell show
    // "name", so there are two matches; just confirm the mapping happened.
    expect(screen.getAllByText("name").length).toBeGreaterThanOrEqual(2);

    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(importLeads).toHaveBeenCalledWith(expect.any(File));
    });

    expect(await screen.findByText("Imported 1 lead(s)")).toBeInTheDocument();
    expect(screen.getByText("0 skipped as duplicate, 1 failed validation")).toBeInTheDocument();
    expect(screen.getByText("Invalid status: bogus-status")).toBeInTheDocument();
    expect(screen.getByText("Invalid")).toBeInTheDocument();
  });
});
