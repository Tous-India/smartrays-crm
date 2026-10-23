import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicComplaintStatus from "./PublicComplaintStatus";
import * as complaintApi from "../api/complaintApi";

vi.mock("../api/complaintApi", () => ({
  getPublicComplaintStatus: vi.fn(),
}));

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

function renderStatus() {
  return render(
    <MemoryRouter initialEntries={[`/complaint/status/${TOKEN}`]}>
      <Routes>
        <Route path="/complaint/status/:token" element={<PublicComplaintStatus />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicComplaintStatus — the customer's status page", () => {
  it("shows the five steps with the current one marked", async () => {
    complaintApi.getPublicComplaintStatus.mockResolvedValue({
      data: { data: { number: 1004, status: "received", technicianName: null, visitDate: null, raisedAt: "2026-10-23T05:00:00Z" } },
    });
    renderStatus();

    expect(await screen.findByText("Complaint No. 1004")).toBeInTheDocument();
    expect(complaintApi.getPublicComplaintStatus).toHaveBeenCalledWith(TOKEN);
    for (const step of ["Received", "Assigned", "On the way", "Working", "Resolved"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText("Received").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText(/will visit/)).not.toBeInTheDocument();
  });

  it("once assigned, names the technician (first name) and the visit date", async () => {
    complaintApi.getPublicComplaintStatus.mockResolvedValue({
      data: { data: { number: 1004, status: "on_the_way", technicianName: "Suresh", visitDate: "2026-10-25", raisedAt: "2026-10-23T05:00:00Z" } },
    });
    renderStatus();

    expect(await screen.findByText(/Suresh will visit on 25 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText("On the way").closest("li")).toHaveAttribute("aria-current", "step");
  });

  it("a wrong link gets a plain message", async () => {
    complaintApi.getPublicComplaintStatus.mockRejectedValue({ response: { status: 404 } });
    renderStatus();
    expect(await screen.findByText("This status link is not valid")).toBeInTheDocument();
  });
});
