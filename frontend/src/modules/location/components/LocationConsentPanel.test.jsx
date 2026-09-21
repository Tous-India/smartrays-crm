import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LocationConsentPanel from "./LocationConsentPanel";
import * as locationApi from "../api/locationApi";

vi.mock("../api/locationApi", () => ({
  fetchLocationConsents: vi.fn(),
}));

describe("LocationConsentPanel (§7.73)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the latest decision per employee, naming those who never answered", async () => {
    locationApi.fetchLocationConsents.mockResolvedValue({
      data: {
        data: [
          {
            employeeId: "e1",
            name: "Priya",
            decision: "granted",
            disclosureVersion: "2026-09-21.1",
            appVersion: "0.0.1",
            recordedAt: "2026-09-21T10:00:00.000Z",
          },
          {
            employeeId: "e2",
            name: "Ramesh",
            decision: "declined",
            disclosureVersion: "2026-09-21.1",
            appVersion: "0.0.1",
            recordedAt: "2026-09-21T11:00:00.000Z",
          },
          { employeeId: "e3", name: "Sita", decision: null, disclosureVersion: null, appVersion: null, recordedAt: null },
        ],
      },
    });

    render(<LocationConsentPanel />);

    expect(await screen.findByText("Priya")).toBeInTheDocument();
    expect(screen.getByText("Granted")).toBeInTheDocument();
    expect(screen.getByText("Declined")).toBeInTheDocument();
    expect(screen.getByText("Not answered")).toBeInTheDocument();
    expect(screen.getAllByText("2026-09-21.1")).toHaveLength(2);
    expect(locationApi.fetchLocationConsents).toHaveBeenCalledTimes(1);
  });

  it("shows an error instead of an empty table when the request fails", async () => {
    locationApi.fetchLocationConsents.mockRejectedValue(new Error("boom"));

    render(<LocationConsentPanel />);

    await waitFor(() => expect(screen.getByText("Could not load consent records")).toBeInTheDocument());
  });
});
