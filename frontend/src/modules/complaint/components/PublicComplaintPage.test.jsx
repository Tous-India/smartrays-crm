import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicComplaintPage from "./PublicComplaintPage";
import * as complaintApi from "../api/complaintApi";

vi.mock("../api/complaintApi", () => ({
  getPublicComplaintPage: vi.fn(),
  raisePublicComplaint: vi.fn(),
}));

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/c/${TOKEN}`]}>
      <Routes>
        <Route path="/c/:token" element={<PublicComplaintPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicComplaintPage — the customer's complaint link", () => {
  it("greets the customer by name and asks four simple things", async () => {
    complaintApi.getPublicComplaintPage.mockResolvedValue({ data: { data: { customerName: "Sharma Residence", complaints: [] } } });
    renderPage();

    expect(await screen.findByText("Hello, Sharma Residence")).toBeInTheDocument();
    expect(complaintApi.getPublicComplaintPage).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText("1. What is the problem about?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Not working/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Billing \/ Payment/ })).toBeInTheDocument();
    expect(screen.getByLabelText("2. What happened?")).toBeInTheDocument();
    expect(screen.getByText("4. When should we call you?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send complaint" })).toBeInTheDocument();
  });

  it("shows a plain message — and no form — for a link that is not valid", async () => {
    complaintApi.getPublicComplaintPage.mockRejectedValue({ response: { status: 404 } });
    renderPage();

    expect(await screen.findByText("This link is not valid")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send complaint" })).not.toBeInTheDocument();
  });

  it("asks for the problem type before sending", async () => {
    complaintApi.getPublicComplaintPage.mockResolvedValue({ data: { data: { customerName: "Sharma Residence", complaints: [] } } });
    renderPage();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("2. What happened?"), "Inverter is beeping");
    await user.click(screen.getByRole("button", { name: "Send complaint" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Please choose what the problem is about.");
    expect(complaintApi.raisePublicComplaint).not.toHaveBeenCalled();
  });

  it("sends the complaint and shows the complaint number", async () => {
    complaintApi.getPublicComplaintPage
      .mockResolvedValueOnce({ data: { data: { customerName: "Sharma Residence", complaints: [] } } })
      .mockResolvedValueOnce({
        data: {
          data: {
            customerName: "Sharma Residence",
            complaints: [{ number: 1004, category: "technical", status: "received", raisedAt: "2026-10-22T10:00:00Z", updatedAt: "2026-10-22T10:00:00Z" }],
          },
        },
      });
    complaintApi.raisePublicComplaint.mockResolvedValue({ data: { data: { number: 1004, status: "received" } } });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Not working/ }));
    await user.type(screen.getByLabelText("2. What happened?"), "Inverter shows a red light");
    await user.click(screen.getByRole("button", { name: /Evening/ }));
    await user.click(screen.getByRole("button", { name: "Send complaint" }));

    expect(await screen.findByText("No. 1004", { selector: "p.text-3xl" })).toBeInTheDocument();
    const [token, form] = complaintApi.raisePublicComplaint.mock.calls[0];
    expect(token).toBe(TOKEN);
    expect(form.get("category")).toBe("technical");
    expect(form.get("description")).toBe("Inverter shows a red light");
    expect(form.get("callbackTime")).toBe("evening");
  });

  it("lists the customer's complaints with plain status words", async () => {
    complaintApi.getPublicComplaintPage.mockResolvedValue({
      data: {
        data: {
          customerName: "Sharma Residence",
          complaints: [
            { number: 1005, category: "sales_billing", status: "in_progress", raisedAt: "2026-10-21T10:00:00Z", updatedAt: "2026-10-22T10:00:00Z" },
            { number: 1002, category: "technical", status: "resolved", raisedAt: "2026-10-10T10:00:00Z", updatedAt: "2026-10-12T10:00:00Z" },
          ],
        },
      },
    });
    renderPage();

    expect(await screen.findByText("Your complaints")).toBeInTheDocument();
    expect(screen.getByText("No. 1005")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("shows the server's message when sending fails, and keeps what was typed", async () => {
    complaintApi.getPublicComplaintPage.mockResolvedValue({ data: { data: { customerName: "Sharma Residence", complaints: [] } } });
    complaintApi.raisePublicComplaint.mockRejectedValue({ response: { status: 429, data: { message: "You have sent several complaints in a short time. Please try again later, or call us." } } });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Something else/ }));
    await user.type(screen.getByLabelText("2. What happened?"), "Need a call about the bill");
    await user.click(screen.getByRole("button", { name: "Send complaint" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("several complaints in a short time"));
    expect(screen.getByLabelText("2. What happened?")).toHaveValue("Need a call about the bill");
  });
});

describe("PublicComplaintPage — optional name and phone (2026-10-23)", () => {
  it("sends the name and phone when the customer fills them in", async () => {
    complaintApi.getPublicComplaintPage.mockResolvedValue({ data: { data: { customerName: "Sharma Residence", complaints: [] } } });
    complaintApi.raisePublicComplaint.mockResolvedValue({ data: { data: { number: 1006, status: "received" } } });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Not working/ }));
    await user.type(screen.getByLabelText("2. What happened?"), "No power since noon");
    await user.type(screen.getByLabelText("Your name"), "Sunita");
    await user.type(screen.getByLabelText("Phone number to call"), "98111 22333");
    await user.click(screen.getByRole("button", { name: "Send complaint" }));

    await waitFor(() => expect(complaintApi.raisePublicComplaint).toHaveBeenCalled());
    const [, form] = complaintApi.raisePublicComplaint.mock.calls[0];
    expect(form.get("contactName")).toBe("Sunita");
    expect(form.get("contactPhone")).toBe("98111 22333");
  });
});
