import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import PublicComplaintForm from "./PublicComplaintForm";
import * as complaintApi from "../api/complaintApi";

vi.mock("../api/complaintApi", () => ({
  submitPublicComplaint: vi.fn(),
}));

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

function renderForm() {
  return render(
    <MemoryRouter initialEntries={["/complaint"]}>
      <PublicComplaintForm />
    </MemoryRouter>
  );
}

async function fillIn(user) {
  await user.type(screen.getByLabelText(/Your name/), "Ramesh Sharma");
  await user.type(screen.getByLabelText(/Phone number/), "98100 12345");
  await user.type(screen.getByLabelText(/Address/), "B-12, Sector 7, Dwarka");
  await user.type(screen.getByLabelText(/What happened|What do you need/), "Inverter shows a red light.");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicComplaintForm — one public link for every customer", () => {
  it("asks first: a complaint, or a new requirement — with Hindi lines", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /Complaint \/ problem/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New requirement/ })).toBeInTheDocument();
    expect(screen.getByText("शिकायत / समस्या")).toBeInTheDocument();
    expect(screen.getByText("नई ज़रूरत")).toBeInTheDocument();
  });

  it("checks name, phone and address before sending", async () => {
    renderForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Complaint \/ problem/ }));
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter your name.");

    await user.type(screen.getByLabelText(/Your name/), "Ramesh");
    await user.type(screen.getByLabelText(/Phone number/), "12");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid phone number.");
    expect(complaintApi.submitPublicComplaint).not.toHaveBeenCalled();
  });

  it("sends a complaint and shows the number and the status link to keep", async () => {
    complaintApi.submitPublicComplaint.mockResolvedValue({ data: { data: { kind: "complaint", number: 1004, statusToken: TOKEN } } });
    renderForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Complaint \/ problem/ }));
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /Evening/ }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    const form = complaintApi.submitPublicComplaint.mock.calls[0][0];
    expect(form.get("kind")).toBe("complaint");
    expect(form.get("name")).toBe("Ramesh Sharma");
    expect(form.get("phone")).toBe("98100 12345");
    expect(form.get("address")).toBe("B-12, Sector 7, Dwarka");
    expect(form.get("description")).toBe("Inverter shows a red light.");
    expect(form.get("callbackTime")).toBe("evening");

    expect(await screen.findByText("No. 1004")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /See the status/ });
    expect(link).toHaveAttribute("href", `/complaint/status/${TOKEN}`);
  });

  it("a new requirement: no photos, and a 'sales team will call' message — no complaint number", async () => {
    complaintApi.submitPublicComplaint.mockResolvedValue({ data: { data: { kind: "requirement" } } });
    renderForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /New requirement/ }));
    expect(screen.queryByRole("button", { name: /Add a photo/ })).not.toBeInTheDocument();
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(complaintApi.submitPublicComplaint.mock.calls[0][0].get("kind")).toBe("requirement");
    expect(await screen.findByText(/sales team will call you/i)).toBeInTheDocument();
    expect(screen.queryByText(/No\. /)).not.toBeInTheDocument();
  });

  it("attaches the phone's location when asked", async () => {
    complaintApi.submitPublicComplaint.mockResolvedValue({ data: { data: { kind: "complaint", number: 1005, statusToken: TOKEN } } });
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 28.5921, longitude: 77.046, accuracy: 15 } }));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    renderForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Complaint \/ problem/ }));
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: /Use my current location/ }));
    expect(await screen.findByText(/Location added/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send" }));

    const form = complaintApi.submitPublicComplaint.mock.calls[0][0];
    expect(form.get("lat")).toBe("28.5921");
    expect(form.get("lng")).toBe("77.046");
    expect(form.get("locationAccuracy")).toBe("15");
  });

  it("shows the server's message when sending fails", async () => {
    complaintApi.submitPublicComplaint.mockRejectedValue({ response: { data: { message: "You have sent several requests in a short time." } } });
    renderForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Complaint \/ problem/ }));
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You have sent several requests in a short time.");
  });
});
