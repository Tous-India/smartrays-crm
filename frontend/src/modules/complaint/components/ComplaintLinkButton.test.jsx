import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComplaintLinkButton from "./ComplaintLinkButton";
import { complaintWhatsAppText } from "../utils/complaintShare";
import * as complaintApi from "../api/complaintApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});

vi.mock("../api/complaintApi", () => ({
  getComplaintLink: vi.fn(),
  resetComplaintLink: vi.fn(),
}));

const URL = "https://crm.example.test/c/AbCdEfGhIjKlMnOpQrStUvWxYz012345";

beforeEach(() => {
  vi.clearAllMocks();
  complaintApi.getComplaintLink.mockResolvedValue({ data: { data: { url: URL, createdAt: "2026-10-22T10:00:00Z" } } });
});

describe("ComplaintLinkButton", () => {
  it("one click fetches the link, copies it, and offers WhatsApp sharing", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<ComplaintLinkButton customerId="c1" customerName="Sharma Residence" />);

    await user.click(screen.getByRole("button", { name: /Complaint link/ }));

    expect(complaintApi.getComplaintLink).toHaveBeenCalledWith("c1");
    expect(await screen.findByTestId("complaint-link-url")).toHaveTextContent(URL);
    expect(writeText).toHaveBeenCalledWith(URL);

    const whatsApp = screen.getByRole("link", { name: /Share on WhatsApp/ });
    expect(whatsApp.getAttribute("href")).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(whatsApp.getAttribute("href"))).toContain(URL);
  });

  it("writes a message the customer can understand, with a Hindi line", () => {
    const text = complaintWhatsAppText("Sharma Residence", URL);

    expect(text).toContain("Hello Sharma Residence,");
    expect(text).toContain("no login needed");
    expect(text).toContain(URL);
    expect(text).toMatch(/[ऀ-ॿ]/);
  });
});
