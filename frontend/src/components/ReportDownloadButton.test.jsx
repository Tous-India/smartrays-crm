import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportDownloadButton from "./ReportDownloadButton";
import * as reportApi from "../services/reportApi";

vi.mock("../services/reportApi", () => ({
  generateReport: vi.fn(),
  triggerBlobDownload: vi.fn(),
}));

const FAKE_BLOB = new Blob(["fake file bytes"]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReportDownloadButton", () => {
  it("calls generateReport with the given module/filters/format and triggers a download from the streamed blob response", async () => {
    reportApi.generateReport.mockResolvedValue({ data: FAKE_BLOB });

    render(<ReportDownloadButton module="attendance" filters={{ from: "2026-06-01", to: "2026-06-30" }} filenamePrefix="my-attendance" />);

    await userEvent.click(screen.getByRole("button", { name: /Download Report/ }));

    await waitFor(() => {
      expect(reportApi.generateReport).toHaveBeenCalledWith({
        module: "attendance",
        filters: { from: "2026-06-01", to: "2026-06-30" },
        format: "xlsx",
      });
    });

    expect(reportApi.triggerBlobDownload).toHaveBeenCalledWith(FAKE_BLOB, "my-attendance-report.xlsx");
  });

  it("uses whichever format is selected", async () => {
    reportApi.generateReport.mockResolvedValue({ data: FAKE_BLOB });

    render(<ReportDownloadButton module="leave" filters={{ scope: "own" }} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByTitle("PDF"));
    await userEvent.click(screen.getByRole("button", { name: /Download Report/ }));

    await waitFor(() => {
      expect(reportApi.generateReport).toHaveBeenCalledWith({
        module: "leave",
        filters: { scope: "own" },
        format: "pdf",
      });
    });
  });
});
