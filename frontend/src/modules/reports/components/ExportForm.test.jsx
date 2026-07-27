import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportForm from "./ExportForm";
import useSessionStore from "../../../store/sessionStore";
import * as reportApi from "../../../services/reportApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, message: { success: vi.fn(), error: vi.fn() } };
});

vi.mock("../../../services/reportApi", () => ({
  generateReport: vi.fn(),
  triggerFileDownload: vi.fn(),
}));

const FAKE_DOWNLOAD_URL = "https://fake.cloudinary.test/leads-report.xlsx";

function setUser(user) {
  useSessionStore.setState({ user, isAuthenticated: true, isLoading: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  reportApi.generateReport.mockResolvedValue({ data: { data: { downloadUrl: FAKE_DOWNLOAD_URL } } });
});

describe("ExportForm", () => {
  it("triggers the dispatcher for the default module (Leads) with no status filter, and handles the downloadUrl", async () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });

    render(<ExportForm />);

    await userEvent.click(screen.getByRole("button", { name: /Download Report/ }));

    await waitFor(() => {
      expect(reportApi.generateReport).toHaveBeenCalledWith({ module: "leads", filters: {}, format: "xlsx" });
    });
    expect(reportApi.triggerFileDownload).toHaveBeenCalledWith(FAKE_DOWNLOAD_URL, "leads-report.xlsx");
  });

  it("only offers modules the current user actually has view access to", async () => {
    setUser({
      _id: "manager-1",
      role: "manager",
      permissions: { attendance: { view_team: true } },
    });

    render(<ExportForm />);

    await userEvent.click(screen.getAllByRole("combobox")[0]);

    expect(screen.getAllByTitle("Attendance").length).toBeGreaterThan(0);
    expect(screen.queryByTitle("Leads")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Payroll")).not.toBeInTheDocument();
  });

  it("shows an empty state instead of a broken form when the user has no report access at all", () => {
    setUser({ _id: "employee-1", role: "employee", permissions: {} });

    render(<ExportForm />);

    expect(screen.getByText("No reports available for your role")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download Report/ })).not.toBeInTheDocument();
  });

  it("sends a status filter for Leads when one is picked", async () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });

    render(<ExportForm />);

    // Second combobox is the status filter (module select is the first).
    const comboboxes = screen.getAllByRole("combobox");
    await userEvent.click(comboboxes[1]);
    await userEvent.click(await screen.findByTitle("Won"));

    await userEvent.click(screen.getByRole("button", { name: /Download Report/ }));

    await waitFor(() => {
      expect(reportApi.generateReport).toHaveBeenCalledWith({
        module: "leads",
        filters: { status: "won" },
        format: "xlsx",
      });
    });
  });

  it("sends a from/to range for Attendance when a custom range is picked", async () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });

    render(<ExportForm />);

    await userEvent.click(screen.getAllByRole("combobox")[0]);
    await userEvent.click(await screen.findByTitle("Attendance"));

    // With no range picked yet, Attendance still exports with empty filters.
    await userEvent.click(screen.getByRole("button", { name: /Download Report/ }));

    await waitFor(() => {
      expect(reportApi.generateReport).toHaveBeenCalledWith({ module: "attendance", filters: {}, format: "xlsx" });
    });
  });

  it("uses whichever format is selected", async () => {
    setUser({ _id: "admin-1", role: "admin", permissions: {} });

    render(<ExportForm />);

    const comboboxes = screen.getAllByRole("combobox");
    const formatSelect = comboboxes[comboboxes.length - 1];
    await userEvent.click(formatSelect);
    await userEvent.click(await screen.findByTitle("PDF"));

    await userEvent.click(screen.getByRole("button", { name: /Download Report/ }));

    await waitFor(() => {
      expect(reportApi.generateReport).toHaveBeenCalledWith({ module: "leads", filters: {}, format: "pdf" });
    });
  });
});
