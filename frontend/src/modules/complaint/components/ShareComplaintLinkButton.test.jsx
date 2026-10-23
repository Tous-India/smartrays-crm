import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";
import ShareComplaintLinkButton from "./ShareComplaintLinkButton";
import * as complaintApi from "../api/complaintApi";

vi.mock("../api/complaintApi", () => ({ getCustomerComplaintLink: vi.fn() }));

const URL = `${window.location.origin}/complaint`;
const MESSAGE = `For any issue with your solar system, tell us here: ${URL}`;

function renderButton(props = {}) {
  return render(
    <App>
      <ShareComplaintLinkButton {...props} />
    </App>
  );
}

describe("ShareComplaintLinkButton — the one public complaint link", () => {
  it("offers WhatsApp, SMS and Copy with a short ready message", async () => {
    renderButton();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Share complaint link/ }));

    expect(screen.getByTestId("complaint-link-url")).toHaveTextContent(URL);
    const whatsApp = screen.getByRole("link", { name: /WhatsApp/ });
    expect(decodeURIComponent(whatsApp.getAttribute("href"))).toContain(MESSAGE);
    expect(whatsApp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const sms = screen.getByRole("link", { name: /SMS/ });
    expect(decodeURIComponent(sms.getAttribute("href"))).toContain(MESSAGE);

    // userEvent.setup() installs its own clipboard stub; spy on that one.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith(MESSAGE);
  });

  it("from a customer's page, shares THAT customer's own link (prefilled form), addressed to their phone", async () => {
    const own = `${window.location.origin}/c/AbCdEfGhIjKlMnOpQrStUvWxYz012345`;
    complaintApi.getCustomerComplaintLink.mockResolvedValue({ data: { data: { url: own } } });
    renderButton({ customerId: "cust-1", phone: "+91 98100 12345", customerName: "Sharma Residence" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Share complaint link/ }));

    expect(complaintApi.getCustomerComplaintLink).toHaveBeenCalledWith("cust-1");
    expect(await screen.findByTestId("complaint-link-url")).toHaveTextContent(own);
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/919810012345\?text=/);
    expect(decodeURIComponent(screen.getByRole("link", { name: /SMS/ }).getAttribute("href"))).toContain(own);
    expect(screen.getByText(/Sharma Residence/)).toBeInTheDocument();
  });;
});
