import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import EmployeeTeamPage from "./EmployeeTeamPage";
import EmployeeProfilePage from "./EmployeeProfilePage";
import useSessionStore from "../store/sessionStore";
import * as teamApi from "../modules/team/api/teamApi";
import * as selfApi from "../modules/user/api/selfApi";

vi.mock("antd", async (importOriginal) => {
  const actual = await importOriginal();
  const mockMessage = { success: vi.fn(), error: vi.fn() };
  actual.App.useApp = () => ({ message: mockMessage });
  return { ...actual, message: mockMessage };
});
vi.mock("../modules/team/api/teamApi", () => ({ getMyTeam: vi.fn() }));
vi.mock("../modules/user/api/selfApi", () => ({
  updateMyProfile: vi.fn(),
  fetchMyPermissions: vi.fn(),
  setCanEditOwnProfile: vi.fn(),
}));

const EMPLOYEE = {
  _id: "emp-1",
  name: "Priya",
  email: "priya@test.local",
  phone: "5550100",
  role: "employee",
  canEditOwnProfile: false,
};

function setUser(overrides = {}) {
  useSessionStore.setState({
    user: { ...EMPLOYEE, ...overrides },
    isAuthenticated: true,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setUser();
});

describe("EmployeeTeamPage", () => {
  it("names the head and the teammates", async () => {
    teamApi.getMyTeam.mockResolvedValue({
      data: {
        data: {
          _id: "t1",
          name: "Install Team",
          head: { _id: "mgr-1", name: "Sam Manager" },
          members: [{ _id: "emp-1", name: "Priya" }],
        },
      },
    });

    render(<EmployeeTeamPage />);

    expect(await screen.findByText("Install Team")).toBeInTheDocument();
    expect(screen.getByText("Sam Manager")).toBeInTheDocument();
    expect(screen.getByText("Team head")).toBeInTheDocument();
    expect(screen.getByText("Priya")).toBeInTheDocument();
  });

  it("shows NO contact details when the backend omitted them", async () => {
    teamApi.getMyTeam.mockResolvedValue({
      data: {
        data: {
          _id: "t1",
          name: "Install Team",
          head: { _id: "mgr-1", name: "Sam Manager" },
          members: [{ _id: "emp-1", name: "Priya" }],
        },
      },
    });

    render(<EmployeeTeamPage />);

    await screen.findByText("Sam Manager");
    expect(screen.queryByTestId("contact-mgr-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("contact-emp-1")).not.toBeInTheDocument();
  });

  it("shows contacts when the team has opted in and the backend sent them", async () => {
    teamApi.getMyTeam.mockResolvedValue({
      data: {
        data: {
          _id: "t1",
          name: "Install Team",
          showContactsToMembers: true,
          head: { _id: "mgr-1", name: "Sam Manager", email: "sam@test.local" },
          members: [{ _id: "emp-1", name: "Priya", email: "priya@test.local" }],
        },
      },
    });

    render(<EmployeeTeamPage />);

    expect(await screen.findByTestId("contact-mgr-1")).toHaveTextContent("sam@test.local");
  });

  it("never shows teammates' attendance or leave status", async () => {
    teamApi.getMyTeam.mockResolvedValue({
      data: {
        data: { _id: "t1", name: "T", head: null, members: [{ _id: "emp-1", name: "Priya" }] },
      },
    });

    render(<EmployeeTeamPage />);

    await screen.findByText("Priya");
    expect(screen.queryByText(/present|absent|on leave/i)).not.toBeInTheDocument();
  });

  it("handles having no team yet", async () => {
    teamApi.getMyTeam.mockResolvedValue({ data: { data: null } });

    render(<EmployeeTeamPage />);

    expect(await screen.findByText("You're not assigned to a team yet")).toBeInTheDocument();
  });
});

describe("EmployeeProfilePage", () => {
  it("renders name and phone READ-ONLY when canEditOwnProfile is false", async () => {
    render(
      <MemoryRouter>
        <EmployeeProfilePage />
      </MemoryRouter>
    );

    expect(screen.getByTestId("readonly-name")).toHaveTextContent("Priya");
    expect(screen.getByTestId("readonly-phone")).toHaveTextContent("5550100");
    // No enabled input for them — not an input that fails on save.
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("renders name and phone as inputs once canEditOwnProfile is true", async () => {
    setUser({ canEditOwnProfile: true });

    render(
      <MemoryRouter>
        <EmployeeProfilePage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Name")).toBeEnabled();
    expect(screen.queryByTestId("readonly-name")).not.toBeInTheDocument();
  });

  it("keeps email read-only in BOTH states", async () => {
    render(
      <MemoryRouter>
        <EmployeeProfilePage />
      </MemoryRouter>
    );
    expect(screen.getByTestId("readonly-email")).toHaveTextContent("priya@test.local");

    setUser({ canEditOwnProfile: true });
    render(
      <MemoryRouter>
        <EmployeeProfilePage />
      </MemoryRouter>
    );
    expect(screen.getAllByTestId("readonly-email").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("sends ONLY the photo when self-editing is off — never a gated field", async () => {
    selfApi.updateMyProfile.mockResolvedValue({ data: { data: {} } });

    render(
      <MemoryRouter>
        <EmployeeProfilePage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(selfApi.updateMyProfile).toHaveBeenCalled());
    const [payload] = selfApi.updateMyProfile.mock.calls[0];
    expect(Object.keys(payload)).toEqual(["photo"]);
    expect(payload).not.toHaveProperty("name");
  });

  it("sends name and phone once self-editing is granted", async () => {
    setUser({ canEditOwnProfile: true });
    selfApi.updateMyProfile.mockResolvedValue({ data: { data: {} } });

    render(
      <MemoryRouter>
        <EmployeeProfilePage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(selfApi.updateMyProfile).toHaveBeenCalled());
    const [payload] = selfApi.updateMyProfile.mock.calls[0];
    expect(payload).toHaveProperty("name");
    expect(payload).toHaveProperty("phone");
  });
});
